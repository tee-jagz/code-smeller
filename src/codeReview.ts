import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { error } from 'console';




let smellReviewPanel: vscode.WebviewPanel | undefined;

type reviewResponse = {
    error: boolean,
    codeSmellScore: number | null,
    codeReview: string | null
}



function returnError(errMsg: string | null = null): reviewResponse {
    return {
        error: true,
        codeSmellScore: null,
        codeReview: errMsg
    }
}


const REVIEWPROMPT = `
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
		`

async function analyzeWithGemini(context: vscode.ExtensionContext, code: string): Promise<reviewResponse> {
    vscode.window.showInformationMessage("Sending code to Gemini...");
    const API_KEY = await context.secrets.get('GEMINI_API_KEY');
    if (!API_KEY) {
        return returnError("GEMINI_API_KEY not found in environment variables.");
    }

    const GEMINIENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`

    const response = await fetch(GEMINIENDPOINT, {
        method: "POST",
        headers: {
        "Content-Type": "application/json"
        },
        body: JSON.stringify({
        contents: [
            {
            parts: [
                {
                text: `${REVIEWPROMPT}\n${code}`
                }
            ]
            }
        ]
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("Gemini API error:", response.status, errorText);
        return returnError(`❌ Gemini API failed with ${response.status}`);
        }

    const jsonResponse: any = await response.json();
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
    return returnError("Failed to parse Gemini output.");
    }

    const result = {...parsedResult, error: false};

    return result;
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}


function cacheReview(
  context: vscode.ExtensionContext,
  code: string,
  review: reviewResponse
) {
  const key = hashCode(code);
  const expiresAt = Date.now() + 3 * 24 * 60 * 60 * 1000;
  context.globalState.update(key, { review, expiresAt });
}


function getCachedReview(
  context: vscode.ExtensionContext,
  code: string
): reviewResponse | null {
  const key = hashCode(code);
  const cached = context.globalState.get<{ review: reviewResponse; expiresAt: number }>(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.review;
  }
  return null;
}


export async function smellCode(context: vscode.ExtensionContext, code:string): Promise<reviewResponse> {
    const cached = getCachedReview(context, code);
    if(cached){
        return cached;
    }

    const review = await analyzeWithGemini(context, code);
    if(!review.error){
        cacheReview(context, code, review)
    }
    return review;
}



function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri, score: number, markdownText: string, error: boolean): string {
    // console.log(`score: ${score}\nerror: ${error}`)
    const imageName = error ? 'sorry.png' : `img${score}.png`;
    const imagePath = vscode.Uri.joinPath(extensionUri, "resources", imageName);    
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

    let body: string;

    if(error){
        body= `
         <body>
            <img src="${imageUri}"  width="120" height="120"/>
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
        `
    }else{

        body = `
            <body>
                <img src="${imageUri}"  width="120" height="120" alt="Code Smell Score ${score}" />
                <p>${smellQuotes[score]}</P>
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
        `
    }
  
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Code Review</title>
    </head>
        ${body}
    </html>
    `;
}


function showReviewPanel(context: vscode.ExtensionContext, content:reviewResponse ){
    const panelTitle = "Code Smeller Review"

    if(smellReviewPanel){
        smellReviewPanel.reveal(vscode.ViewColumn.Beside);
        smellReviewPanel.webview.html = getWebviewContent(smellReviewPanel.webview, context.extensionUri, content.codeSmellScore, content.codeReview, content.error)
    } else {
        smellReviewPanel = vscode.window.createWebviewPanel(
            'codeSmellerReview',                      // internal ID
            panelTitle,                   // Title
            vscode.ViewColumn.Beside,               // Side panel
            { enableScripts: true }                // Disable JS for now
        );
        
        smellReviewPanel.webview.html = getWebviewContent(smellReviewPanel.webview, context.extensionUri, content.codeSmellScore, content.codeReview, content.error);

        smellReviewPanel.onDidDispose(() => {
            smellReviewPanel = undefined;
        });
    };
}

export async function codeReviewCommand(context: vscode.ExtensionContext) {
		
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
		vscode.window.showInformationMessage("No file open.");
		return;
		}

		const code = editor.document.getText();
		const result = await smellCode(context, code);

		showReviewPanel(context, result)
	}