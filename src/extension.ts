import * as vscode from 'vscode';
import { codeReviewCommand } from './codeReview'
import { syntaxSmeller } from './codeSyntax';
const fetch = require('node-fetch');


let config = vscode.workspace.getConfiguration("codeSmeller")
let supportedLanguages = Object.values(config.get<string[]>("supportedLanguages")) || []

function refreshSupportedLanguages() {
  config = vscode.workspace.getConfiguration("codeSmeller");
  supportedLanguages = Object.values(config.get<string[]>("supportedLanguages")) || []
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
	
	const codeReviewPanel = vscode.commands.registerCommand('codeSmeller.smellCode', async() => codeReviewCommand(context));

	context.subscriptions.push(codeReviewPanel, setApiKeyCommand, addSupportedLanguage);
}
