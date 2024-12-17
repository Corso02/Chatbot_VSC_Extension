import { exec } from 'child_process';
import * as path from 'path';
import { ExtensionContext, TextDocument, Position, commands, window, languages, StatusBarAlignment, WorkspaceEdit, workspace } from 'vscode';
import {
    CancellationToken,
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient;
const statusBarMessage = window.createStatusBarItem(StatusBarAlignment.Left);

export function activate(context: ExtensionContext) {
    // Cesta k serverovému modulu
    const serverModule = context.asAbsolutePath(
        path.join('out', "server", "src", 'server.js')
    );

    let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

    // Nastavenia servera
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
    };

    // Nastavenia klienta
    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'chatbot' }]
    };

    // Inicializácia klienta
    client = new LanguageClient(
        'exampleLanguageServer',
        'Example Language Server',
        serverOptions,
        clientOptions
    );

    let hoverProvider = languages.registerHoverProvider('*', {
        provideHover(document: TextDocument, position: Position, token: CancellationToken) {
            return null;
        }
    });
    
    const compileChatbot = commands.registerCommand("extension.compileChatbot", async () => {
        const activeEditor = window.activeTextEditor;
        
        if (!activeEditor) {
            window.showErrorMessage('No active file found!');
            return;
        }

        const filePath = activeEditor.document.uri.fsPath;

        const errorDiagnostics = languages.getDiagnostics(activeEditor.document.uri).filter((v) => v.code?.toString().includes("Error"))
    
        if(errorDiagnostics.length != 0){
            let msg = errorDiagnostics.length === 1 ? "Bolo nájdená 1 chyba. Kompilácia pozastavená" : `Bolo nájdených ${errorDiagnostics.length} chýb. Kompilácia pozastavená.`
            window.showErrorMessage(msg);
            return;
        }
        const outputDirPath = filePath.slice(0, filePath.lastIndexOf("\\"));

        window.showInformationMessage("Kompilácia spustená");

        //const numberOfLines = activeEditor.document.lineCount; NEJAK vymysliet to ze ked na konci neni prazdny riadok tak ho pridam
       /*  const document = activeEditor.document;
        const lastLine = document.lineAt(document.lineCount - 1);
        if(!lastLine.isEmptyOrWhitespace){
            const edit = new WorkspaceEdit();
            const position = new Position(document.lineCount, 0);
            edit.insert(document.uri, position, "\n");

            await workspace.applyEdit(edit);
            await document.save();
        } */
        

        // Path to your JAR file
        const jarPath = path.join(__dirname, 'Chatbot_DSL_Compiler.jar');

        // Construct the command
        const command = `java -jar ${jarPath} -input "${filePath}" -output "${outputDirPath}"`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                window.showErrorMessage(`Error: ${error.message}`);
              return;
            }
            if (stderr) {
                window.showWarningMessage(`Warning: ${stderr}`);
            }
                window.showInformationMessage(`Output: ${stdout}`);
          });
    })

    context.subscriptions.push(compileChatbot);
    context.subscriptions.push(hoverProvider);
    client.start();

    console.log("client running")
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    statusBarMessage.dispose();
    return client.stop();
}
