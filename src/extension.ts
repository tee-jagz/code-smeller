import * as vscode from 'vscode';
import * as crypto from 'crypto';
const fetch = require('node-fetch');

let smellReviewPanel: vscode.WebviewPanel | undefined;

let config = vscode.workspace.getConfiguration("codeSmeller")
let supportedLanguages = Object.values(config.get<string[]>("supportedLanguages")) || []

function refreshSupportedLanguages() {
  config = vscode.workspace.getConfiguration("codeSmeller");
  supportedLanguages = Object.values(config.get<string[]>("supportedLanguages")) || []
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}


function debounce<T extends (...args: any[]) => void>(fn: T, delay = 300): T {
  let timeout: NodeJS.Timeout;
  return function (this: any, ...args: any[]) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  } as T;
}


function cacheReview(
  context: vscode.ExtensionContext,
  code: string,
  review: string
) {
  const key = hashCode(code);
  const expiresAt = Date.now() + 3 * 24 * 60 * 60 * 1000;
  context.globalState.update(key, { review, expiresAt });
}


function getCachedReview(
  context: vscode.ExtensionContext,
  code: string
): string | null {
  const key = hashCode(code);
  const cached = context.globalState.get<{ review: string; expiresAt: number }>(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.review;
  }
  return null;
}


function getInstruction(code: string): string{
	return `
		Act as a senior engineer reviewing a production pull request.  
		Assume the author is mid-level or junior and wants to improve.  
		Focus on high-impact issues. Suggest best practices only where they materially improve clarity, maintainability, or correctness.  
		Do not explain beginner concepts or rewrite the code.

		Use official documentation primarily and widely-accepted conventions of the language, framework, or libraries.

		### Review Criteria
		Identify and suggest improvements only for:
		- Poor or vague variable naming
		- DRY violations or repeated logic
		- Functions that are too long or do too much
		- SRP (Single Responsibility Principle) violations
		- Tight coupling or poor abstraction
		- Missing or weak error handling
		- Long parameter lists or data clumps
		- Violations of separation of concerns
		- Patterns that reduce readability or reuse

		### Output Rules
		- Do not restate or reformat the input code
		- Do not include any headings, summaries, or introductions
		- Do not use markdown or prose outside the JSON block
		- Limit the review to 10 points max
		- Use direct, concise, actionable language
		- Output must be valid JSON — nothing else
		- Provide output as bullet points

		### Output Format
		Return exactly:

		{
		"codeSmellScore": <integer from 1 to 5>,
		"codeReview": "<string, with a max of 1500 characters>"
		}

		Score definitions:
		- 1 = Excellent (no real issues)
		- 2 = Minor issues (clean but room for polish)
		- 3 = Moderate issues (some maintainability or readability problems)
		- 4 = Major issues (clear violations or design concerns)
		- 5 = Severe issues (unreadable, broken, or unsafe code)

		### Code to review:
		${code}
		`
}


async function analyzeWithGemini(context: vscode.ExtensionContext, code: string): Promise<any> {
	vscode.window.showInformationMessage("Sending code to Gemini...");
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


class syntaxSmeller implements vscode.WebviewViewProvider{

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

	private readonly debouncedUpdate = debounce(async (doc: vscode.TextDocument) => {
		if (!this._view || doc.isUntitled || !supportedLanguages.includes(doc.languageId)) {
			console.log(`Sorry not supported.\n Doc languageId is ${doc.languageId}`)
			this._view.webview.html = this._getHtmlForWebview(this._view.webview, 0, true);
			return;
		}

		const diagnostics = vscode.languages.getDiagnostics(doc.uri);
		
		let errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
		let warnings = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Warning).length;
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
		 
		const smellQuotes: Record<number, string> = {
			1: "Shishishi~! That code's cleaner than a Marine’s uniform!",
			2: "Oi... something smells a bit off here.",
			3: "Hnnngh! This syntax is startin’ to reek!",
			4: "BLEGH! You tryin’ to poison me with this code?!",                    
			5: "THIS CODE SMELL’S KILLIN’ ME!!! I’M NOT GOIN’ OUT LIKE THIS!!!",
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


async function smellCode(context: vscode.ExtensionContext, code:string) {
	const cached = getCachedReview(context, code);
	if(cached){
		return cached;
	}

	const review = await analyzeWithGemini(context, code);
	cacheReview(context, code, review);
	return review;
}


function showReviewPanel(context: vscode.ExtensionContext, content:any ){
	const panelTitle = "Code Smeller Review"

	if(smellReviewPanel){
		smellReviewPanel.reveal(vscode.ViewColumn.Beside);
		smellReviewPanel.webview.html = getWebviewContent(smellReviewPanel.webview, context.extensionUri, content.codeSmellScore, content.codeReview)
	} else {
		smellReviewPanel = vscode.window.createWebviewPanel(
			'codeSmellerReview',                      // internal ID
			panelTitle,                   // Title
			vscode.ViewColumn.Beside,               // Side panel
			{ enableScripts: true }                // Disable JS for now
		);
		

		if (typeof content === "string") {
				// error message
				smellReviewPanel.webview.html = `
				<!DOCTYPE html>
				<html>
				<body>
					<h2>Gemini Analysis Failed</h2>
					<pre>${content}</pre>
				</body>
				</html>
				`;
				return;
			}
		smellReviewPanel.webview.html = getWebviewContent(smellReviewPanel.webview, context.extensionUri, content.codeSmellScore, content.codeReview);

		smellReviewPanel.onDidDispose(() => {
			smellReviewPanel = undefined;
		});
	};
	}


export function deactivate() {
  vscode.workspace.getConfiguration().update("codeSmellerCache", {}, true);
}


export function activate(context: vscode.ExtensionContext) {
	console.log("Code Smeller extension is active 🚀");

	const provider = new syntaxSmeller(context.extensionUri)

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('codeSmellerLiveSmell', provider)
	);

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


	const addSupportedLanguage = vscode.commands.registerCommand("codeSmeller.addLanguage", async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage("Open a file to detect its language.")
			return;
		}

		const langid = editor.document.languageId;
		console.log(`Supported Languages ${supportedLanguages}\nTypeof: ${typeof supportedLanguages}`)

		if(supportedLanguages.includes(langid)){
			vscode.window.showInformationMessage(`"${langid}" is already a supported language.`)
			return;
		}

		const updatedSupportedLanguages = {...supportedLanguages, langid};

		await config.update("supportedLanguages", updatedSupportedLanguages, vscode.ConfigurationTarget.Global);
		refreshSupportedLanguages()
		vscode.window.showInformationMessage(`"${langid}" now supported.`)
		}
	)	
	
	let codeReviewPanel = vscode.commands.registerCommand('codeSmeller.smellCode', async () => {
		
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
		vscode.window.showInformationMessage("No file open.");
		return;
		}

		const code = editor.document.getText();
		// vscode.window.showInformationMessage("Sending code to Gemini...");
		const result = await smellCode(context, code);

		showReviewPanel(context, result)
	});

	context.subscriptions.push(codeReviewPanel, setApiKeyCommand, addSupportedLanguage);
}
