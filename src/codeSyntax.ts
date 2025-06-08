import * as vscode from 'vscode';

let config = vscode.workspace.getConfiguration("codeSmeller")
let supportedLanguages = Object.values(config.get<string[]>("supportedLanguages")) || []

function debounce<T extends (...args: any[]) => void>(fn: T, delay = 300): T {
  let timeout: NodeJS.Timeout;
  return function (this: any, ...args: any[]) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  } as T;
}

export class syntaxSmeller implements vscode.WebviewViewProvider{

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