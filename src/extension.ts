import * as vscode from 'vscode';
import { runLinter, LintStats } from './lintRunner';
import { promises } from 'dns';

const fetch = require('node-fetch'); // make sure it's in your deps

function debounce<T extends (...args: any[]) => void>(fn: T, delay = 300): T {
  let timeout: NodeJS.Timeout;
  return function (this: any, ...args: any[]) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  } as T;
}


async function analyzeWithGemini(context: vscode.ExtensionContext, code: string): Promise<string> {
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
              text: `
You are an Engineering Manager with 10 years of experience trying to get your developers to a senior developer quickly.
Review their code.
You MUST use the official documentations as guide to the best practices of the language and framworks or libraries used
Suggest improvements according to best coding standards:
1. Variable name improvements
2. Refactoring suggestions (DRY, SRP, decomposition)
3. Any deviations from best practices
4. Where types can be declared and how
5. Other improvements you can think of based on official documentation of the language, framwork and library used or general programming concensus



Return a structured response in Markdown.

IMPORTANT: Do not rewrite the code. Just return suggestions of improvement for best coding practices without explicitly spelling out code as much as possible

Try to be succinct and straight to the point

Start by giving an overall smell score from 1 to 5 with 5 being the smelliest.

Code:
\`\`\`
${code}
\`\`\`
Respond with clear suggestions.`
            }
          ]
        }
      ]
    })
  });

  const json = await response.json();
//   console.log(json)
  return json?.candidates?.[0]?.content?.parts?.[0]?.text || "No feedback.";
}

function getWebviewContent(markdownText: string): string {
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


		// vscode.workspace.onDidChangeTextDocument(
		// 	async (e: vscode.TextDocumentChangeEvent) => {
		// 		// 1. Lint / analyse the current contents
		// 		const { errors, warnings } = await this.analyzeCode(
		// 		e.document
		// 		);

		// 		// 2. Convert to “smell” score
		// 		const score = this.getScore(errors, warnings);

		// 		// 3. Refresh the sidebar
		// 		if (this._view) {
		// 		this._view.webview.html = this._getHtmlForWebview(
		// 			this._view.webview,
		// 			score
		// 		);
		// 		}
		// 	}
		// 	);

			const activeDoc = vscode.window.activeTextEditor?.document;
			if (activeDoc && !activeDoc.isUntitled) {
			const { errors, warnings } = await this.analyzeCode(activeDoc);
			const score = this.getScore(errors, warnings);
			webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, score);
			}

		// webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, 1);
	}

	public getScore(errors: number, warnings: number){
		if(errors > 1){
			return 5
		}
		if(warnings == 0 && errors == 0) return 1;
		if(warnings <= 10) return 2;
		if(warnings <= 20) return 3;
		if(warnings <= 30) return 4;
		return 5;
	}

	public async analyzeCode(document: vscode.TextDocument){
		const language = document.languageId;
		const code = document.getText();
		const state = await runLinter(language, code);

		return state
	}

	private readonly debouncedUpdate = debounce(async (doc: vscode.TextDocument) => {
		if (!this._view || doc.isUntitled || !["python", "javascript", "typescript"].includes(doc.languageId)) {
			return;
		}

		const { errors, warnings } = await this.analyzeCode(doc);
		const score = this.getScore(errors, warnings);

		this._view.webview.html = this._getHtmlForWebview(this._view.webview, score);
		}, 400);


	private _getHtmlForWebview(webview: vscode.Webview, score: number): string {
		const imageFileName = `img${score}.png`

		const imageUrl = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'resources', imageFileName));
		 
		const message = score == 1 ? "Nice smelling syntax" : score == 2 ? "???" : score == 3 ? "Hmmm!!! Watch it!" : score == 4 ? "Your syntax stinks!" : "I am dying from your stinking syntax"
		return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<title>Code Smell</title>
			</head>
			<body>
				<div id="content">${message}</div>
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
	  
	panel.webview.html = getWebviewContent(result);
  });



  context.subscriptions.push(disposable, setApiKeyCommand);
}
