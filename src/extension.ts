import * as vscode from 'vscode';
const fetch = require('node-fetch'); // make sure it's in your deps

async function analyzeWithGemini(context: vscode.ExtensionContext, code: string): Promise<string> {
//   const API_KEY = 'AIzaSyDPUqIjp_dt8aZ6BflMvIDDu2NNQCbNZgs';
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
  

export function activate(context: vscode.ExtensionContext) {
  console.log("Code Smeller extension is active 🚀");

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
