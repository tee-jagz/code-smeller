import * as vscode from 'vscode';
// import { runLinter, LintStats } from './lintRunner';
// import { connected } from 'process';
// import { GoogleGenAI, Type } from "@google/genai";

const fetch = require('node-fetch'); // make sure it's in your deps

function debounce<T extends (...args: any[]) => void>(fn: T, delay = 300): T {
  let timeout: NodeJS.Timeout;
  return function (this: any, ...args: any[]) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  } as T;
}

function getInstruction(code: string): string{
	return `
		You are an Engineering Manager with 10 years of experience trying to help developers grow into senior engineers.

		Your task is to review the code below and provide constructive, actionable feedback.

		You MUST use official documentation and widely-accepted best practices of the language, framework, or libraries used.

		### Focus Areas

		Identify and suggest improvements for:
		1. Variable naming clarity and consistency
		2. Refactoring opportunities, but ONLY where relevant:
		- DRY violations
		- Decomposition of large functions
		- SRP (Single Responsibility Principle) violations
		- Tight coupling or poor abstraction
		- Poor or missing error handling
		- Data clumps or long parameter lists
		- Violations of separation of concerns
		- Any patterns that make the code harder to read, test, or reuse

		⚠️ Be succinct, practical, and helpful.
		- Do **not** rewrite or restate the code.
		- Do **not** suggest changes unless they will clearly improve the codebase or developer's skills.
		- Avoid nitpicking or pedantic suggestions.
		- Stay focused on what matters most.
		- Try to give guiding instructions without actively writing the code
		- Go straight to the review with no added sentence or introduction before


		You MUST return your output strictly as a JSON object in this format:

		\`\`\`json
		{
		"codeSmellScore": number,
		"codeReview": string
		}
		\`\`\`

		codeSmellScore is a smell score from 1 to 5 with 5 being code with terrible practices and 1 being clean code with no issues

		Code to review:

		\`\`\`
		${code}
		\`\`\`
		`
}



async function analyzeWithGemini(context: vscode.ExtensionContext, code: string): Promise<any> {
  const API_KEY = await context.secrets.get('GEMINI_API_KEY');
  if (!API_KEY) {
    return "GEMINI_API_KEY not found in environment variables.";
  }


  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: getInstruction(code)
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
	const errorText = await response.text();
	console.error("Gemini API error:", response.status, errorText);
	return `❌ Gemini API failed with ${response.status}`;
	}
 

  const jsonResponse = await response.json();
  console.log(jsonResponse)
  let rawText = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text;

rawText = rawText.trim();
if (rawText.startsWith("```json") || rawText.startsWith("```")) {
  rawText = rawText.replace(/^```json/, "").replace(/^```/, "").replace(/```$/, "").trim();
}

let parsedResult;
try {
  parsedResult = JSON.parse(rawText);
} catch (e) {
  console.error("Failed to parse Gemini response as JSON.", e, rawText);
  return "Failed to parse Gemini output.";
}

return parsedResult;
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri, score: number, markdownText: string): string {
	const imagePath = vscode.Uri.joinPath(extensionUri, "resources", `img${score}.png`);
    const imageUri = webview.asWebviewUri(imagePath);

	const smellQuotes: Record<number, string> = {
		1: "Shishishi~! This code’s tighter than a well-trimmed anchor rope!",           
		2: "Oi... it’s decent, but somethin’s off in the wind.",                         
		3: "Hnnngh! It’s not the worst, but it needs some serious polish.",             
		4: "BLEGH! There’s too much goin’ on — clean it up or we’ll sink!",              
		5: "THIS CODE’S A DISASTER! PATCH THE HOLES OR WE’RE GOING DOWN!!",             
		};

	const escapedMarkdown = markdownText
	  .replace(/\\/g, "\\\\")
	  .replace(/`/g, "\\`")
	  .replace(/\$/g, "\\$");
  
	return `
	<!DOCTYPE html>
	<html lang="en">
	<head>
	  <meta charset="UTF-8">
	  <title>Code Review</title>
	</head>
	<body>
	  <img src="${imageUri}"  width="120" height="120" alt="Code Smell Score ${score}" />
	  <p>${smellQuotes[score]}</p>
	  <div id="content">Loading review...</div>
  
	  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
	  <script>
		const raw = \`${escapedMarkdown}\`;
		window.addEventListener('load', () => {
		  if (window.marked) {
			document.getElementById("content").innerHTML = marked.parse(raw);
		  } else {
			document.getElementById("content").innerText = "Failed to load markdown renderer.";
		  }
		});
	  </script>
	</body>
	</html>
	`;
  }

class testProv implements vscode.WebviewViewProvider{

	public static readonly viewType = 'codeSmellerLiveSmell';

	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri
	) {}

	public async resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,

			localResourceRoots: [
				this._extensionUri
			]
		};

		vscode.workspace.onDidChangeTextDocument(e => {
			this.debouncedUpdate(e.document);
			});
		
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor) this.debouncedUpdate(editor.document);
			});

			const activeDoc = vscode.window.activeTextEditor?.document;
			if (activeDoc && !activeDoc.isUntitled) {
			// const { errors, warnings } = await this.analyzeCode(activeDoc);
			const diagnostics = vscode.languages.getDiagnostics(activeDoc.uri);			
			let errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
			let warnings = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Warning).length;
		
			const score = this.getScore(errors, warnings);
			webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, score);
			}

		// webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, 1);
	}

	public getScore(errors: number, warnings: number){
		// console.log(`Scoring... The errors are ${errors} and warnings are ${warnings}`)
		if(errors > 0){
			return 5
		}
		if(warnings == 0 && errors == 0) return 1;
		if(warnings <= 5) return 2;
		if(warnings <= 10) return 3;
		if(warnings <= 15) return 4;
		return 5;
	}

	// public async analyzeCode(document: vscode.TextDocument){
	// 	const language = document.languageId;
	// 	const code = document.getText();
	// 	const state = await runLinter(language, code);

	// 	return state
	// }

	private readonly debouncedUpdate = debounce(async (doc: vscode.TextDocument) => {
		if (!this._view || doc.isUntitled || !["python", "javascript", "typescript", "typescriptreact", "javascriptreact"].includes(doc.languageId)) {
			console.log(`Sorry not supported.\n Doc languageId is ${doc.languageId}`)
			this._view.webview.html = this._getHtmlForWebview(this._view.webview, 0, true);
			return;
		}

		const diagnostics = vscode.languages.getDiagnostics(doc.uri);
		// let errors: number, warnings: number;
		let errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
		let warnings = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Warning).length;
		// console.log(`No of Errors: ${errors}`)
		// console.log(`No of Warnings: ${warnings}`)
		// console.log(diagnostics)
		// }
		// else{
		// 	let { errors, warnings } = await this.analyzeCode(doc);
		// }
		const score = this.getScore(errors, warnings);

		this._view.webview.html = this._getHtmlForWebview(this._view.webview, score);
		}, 400);


	private _getHtmlForWebview(webview: vscode.Webview, score: number = 0, noSupport: boolean = false): string {
		if(noSupport){
			const imageUrl = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', 'sorry.png'));
			return `
				<!DOCTYPE html>
				<html lang="en">
				<head>
					<meta charset="UTF-8">
					<title>Code Smell</title>
				</head>
				<body>

					<p id="content">GYAAAH!! I can’t read this language!! I’m sorry!! I’ll try harder next time, okay?!</p>
					<img src=${imageUrl}>
				</body>
				</html>
			`;

		}
		const imageFileName = `img${score}.png`

		const imageUrl = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', imageFileName));
		 
		// const message = score == 1 ? "Nice clean syntax" : score == 2 ? "???" : score == 3 ? "Hmmm!!! Watch it!" : score == 4 ? "Your syntax stinks!" : "I am dying from your stinking syntax"
		const smellQuotes: Record<number, string> = {
			1: "Shishishi~! That code's cleaner than a Marine’s uniform!",           // Luffy
			2: "Oi... something smells a bit off here.",                              // Zoro
			3: "Hnnngh! This syntax is startin’ to reek!",                            // Sanji
			4: "BLEGH! You tryin’ to poison me with this code?!",                     // Usopp
			5: "THIS CODE SMELL’S KILLIN’ ME!!! I’M NOT GOIN’ OUT LIKE THIS!!!",     // Luffy or Usopp
			};

		// Usage:
		const message = smellQuotes[score];

		return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<title>Code Smell</title>
			</head>
			<body>

				<p id="content">${smellQuotes[score]}</p>
				<img src=${imageUrl}>
			</body>
			</html>
		`;
	}
}

export function activate(context: vscode.ExtensionContext) {
  console.log("Code Smeller extension is active 🚀");
  const provider = new testProv(context.extensionUri)
//   const sidePanel = vscode.window.registerWebviewViewProvider(
// 	'codeSmellerLiveSmell'
// 	, provider
//   )

context.subscriptions.push(
	vscode.window.registerWebviewViewProvider('codeSmellerLiveSmell', provider)
  );

//   sidePanel.webview.html = getSmellScoreView(2);

  const setApiKeyCommand = vscode.commands.registerCommand('codeSmeller.setApiKey', async () => {
	const key = await vscode.window.showInputBox({
	  prompt: 'Enter your Gemini API key',
	  password: true,
	  ignoreFocusOut: true
	});
  
	if (key) {
	  await context.secrets.store('GEMINI_API_KEY', key);
	  vscode.window.showInformationMessage("Gemini API key saved.");
	}
  });
  
  
  let disposable = vscode.commands.registerCommand('codeSmeller.smellCode', async () => {
	console.log("Running Gemini code review...");
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage("No file open.");
      return;
    }

    const code = editor.document.getText();
    vscode.window.showInformationMessage("Sending code to Gemini...");
    const result = await analyzeWithGemini(context, code);

    const panel = vscode.window.createWebviewPanel(
		'codeSmellerReview',                      // internal ID
		'Code Smeller Review',                   // Title
		vscode.ViewColumn.Beside,               // Side panel
		{ enableScripts: true }                // Disable JS for now
	  );
	  

	  if (typeof result === "string") {
			// error message
			panel.webview.html = `
			<!DOCTYPE html>
			<html>
			<body>
				<h2>Gemini Analysis Failed</h2>
				<pre>${result}</pre>
			</body>
			</html>
			`;
			return;
		}
	panel.webview.html = getWebviewContent(panel.webview, context.extensionUri, result.codeSmellScore, result.codeReview);
  });



  context.subscriptions.push(disposable, setApiKeyCommand);
}
