import {
    createConnection,
    ProposedFeatures,
    TextDocuments,
    InitializeParams,
    Hover,
    TextDocumentSyncKind,
    HoverParams,
    IPCMessageReader,
    IPCMessageWriter,
    CompletionParams,
    CompletionItemKind,
    CompletionItem,
    Diagnostic,
    DiagnosticSeverity,
    TextDocumentItem,
} from 'vscode-languageserver/node';

import {
    TextDocument
} from 'vscode-languageserver-textdocument';

import * as fs from 'fs';
import path from 'path';

// Vytvor pripojenie
const connection = createConnection(ProposedFeatures.all,  new IPCMessageReader(process), new IPCMessageWriter(process));
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

const grammarPath = path.resolve(path.join(__dirname, "..", "..", "..", "syntaxes", "chatbot.tmLanguage.json"));
const wasmPath = path.join(__dirname, '../../../node_modules/vscode-oniguruma/release/onig.wasm');
const grammarFile = fs.readFileSync(grammarPath, "utf-8");

let regexPatterns: { [key: string]: RegExp } = {};

let hoverTexts: {[key: string]: string} = {};

function createRegexPatterns(){
    regexPatterns["saveAnswer"] = new RegExp(/\bsaveAnswer\b/);
}

function createHoverTexts(){
    hoverTexts["saveAnswer"] = "Odpoved na tuto otazku bude ulozena";
}

// Načítanie regexov z lmLanguage.json
connection.onInitialize((params: InitializeParams) => {
    connection.console.debug("Server initialize");

    createHoverTexts();
    createRegexPatterns();

    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            hoverProvider: true,
            completionProvider: {
                resolveProvider: true, 
                triggerCharacters: [" ", "\n", "!", "{"]
            },
        }
    };
});

connection.onHover((params: HoverParams): Hover | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        console.log("Hover without documnet")
        return null;
    }

    if(params.position.line === 0){
        return {
            contents: {
                kind: "markdown",
                value: `Prvá správa vášho chatbota.  
                Bude zobrazená stále pri sputení dialógu.`
            }
        };
    }

    const text = document.getText();
    const position = params.position;

    const lines = text.split('\n');
    const lineText = lines[position.line];

    
    const wordRange = getWordAtPosition(lineText, position.character);
    if (!wordRange) {
        return null;
    }

    const word = lineText.substring(wordRange.start, wordRange.end);

    if(/^\{.*\}$/.test(word)){
        let questionName = word.substring(1, word.length - 1);
        return {
            contents: {
                kind: "markdown",
                value: `Referencia na odpoveď na otázku **${questionName}**`
            }
        };
    }

    if(word === "saveAnswer"){
        for(let line = position.line - 1; line >= 0; line--){
            if(/^\s*\b[a-zA-Z0-9áéíóúäôčďľňřšťžýÁÉÍÓÚÄÔČĎĽŇŘŠŤŽÝ]+\b\s*$/.test(lines[line])){
                let questionName = (lines[line].match(/\b[a-zA-Z0-9áéíóúäôčďľňřšťžýÁÉÍÓÚÄÔČĎĽŇŘŠŤŽÝ]+\b/) || ["undefined"])[0]
                return {
                    contents: {
                        kind: "markdown",
                        value: `Odpoveď na otázku **${questionName}** bude uložená  
                        Pre prístup k tejto odpovedi použite **{${questionName}}**`
                    }
                }
            }
        }
    }

    if(word === "option"){
        return {
            contents: {
                kind: "markdown",
                value: `Možnosť pre používateľa`
            }
        }
    }

    if(word === "keywords"){
        return {
            contents: {
                kind: "markdown",
                value: `Množina kľučových slov`
            }
        }
    }

    if(word === "nextQuestion"){
        return {
            contents: {
                kind: "markdown",
                value: `Odkaz na meno následujúcej otázky`
            }
        }
    }

    if(word === "*"){
        return {
            contents: {
                kind: "markdown",
                value: `Každá odpoveď bude považovaná za valídnu`
            }
        }
    }

    for (const [name, regex] of Object.entries(regexPatterns)) {
        regex.lastIndex = 0; // Reset regexu
        if (regex.test(word)) {
            return {
                contents: {
                    kind: "markdown",
                    value: `${hoverTexts[name]}`
                }
            };
        }
    }

    return null; 
});

function getWordAtPosition(line: string, character: number): { start: number, end: number } | null {
    const match = /\b[a-zA-Z0-9áéíóúäôčďľňřšťžýÁÉÍÓÚÄÔČĎĽŇŘŠŤŽÝ]+\b|\{\b[a-zA-Z0-9áéíóúäôčďľňřšťžýÁÉÍÓÚÄÔČĎĽŇŘŠŤŽÝ]+\b\}|\*/g;
    let result;
    while ((result = match.exec(line)) !== null) {
        const [matchText] = result;
        const start = result.index;
        const end = start + matchText.length;
        if (character >= start && character <= end) {
            return { start, end };
        }
    }
    return null;
}

connection.onCompletion((params: CompletionParams) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return {isIncomplete: false, items: []};
    }

    let lastDotIdx = document.uri.lastIndexOf(".");
    let extension = document.uri.substring(lastDotIdx + 1);
    
    const text = document.getText();
    const position = params.position;
    const lines = text.split('\n');

    if(position.line === 0 && lines[0].length <= 1){
        return {
            isIncomplete: false,
            items: [
                {
                    label: "\!",
                    kind: CompletionItemKind.Snippet,
                    detail: "Pripraví základnú štruktúru",
                    documentation: "Pripraví základnú štruktúru",
                }
            ]
        }
        
    }

    if (position.line > 0) {
        if(lines[position.line][position.character - 1] === "{" && lines[position.line][position.character] === "}"){
            if(lines[position.line].includes("keywords:") || 
               lines[position.line].includes("saveAnswer") ||
               lines[position.line].includes("option") ||
               lines[position.line].includes("nextQuestion:")
            ) return null;
            
            else{
                if(position.line === 1){
                    let questionNames = getAllQuestionNamesWithSavedAnswer(lines);
                    let res: CompletionItem[] = [];
                    for(let name of questionNames){
                        res.push({
                            label: name,
                            kind: CompletionItemKind.Field,
                            detail: `Odkaz na otázku ${name}`
                        })
                    }
                    return res;       
                }
                for(let line = position.line - 1; line >= 0; line--){
                    let previousLine = lines[line].trim();
                    if(previousLine.length === 0 || previousLine === "saveAnswer"){
                        continue;
                    }
                    //nasiel som meno otazky
                    if (/^\b[a-zA-Z0-9áéíóúäôčďľňřšťžýÁÉÍÓÚÄÔČĎĽŇŘŠŤŽÝ]+\b$/.test(previousLine)){
                        let questionName = (previousLine.match(/\b[a-zA-Z0-9áéíóúäôčďľňřšťžýÁÉÍÓÚÄÔČĎĽŇŘŠŤŽÝ]+\b/) || ["undefined"])[0]
                        
                        if(questionName === "undefined"){
                            continue
                        }
    
                        let questionNames = getAllQuestionNamesWithSavedAnswer(lines, questionName);
                        let res: CompletionItem[] = [];
                        for(let name of questionNames){
                            res.push({
                                label: name,
                                kind: CompletionItemKind.Field,
                                detail: `Odkaz na otázku ${name}`
                            })
                        }
                        return res;       
                    }
                }
            }
        }
        if(position.line === 1){
            return null;
        }
        if(lines[position.line].trim().includes("keywords:")){
            let parts = lines[position.line].trim().split(":")
            if(parts[1].length === 0){
                return {
                    isIncomplete: false,
                    items: [
                        {
                            label: 'wildcard',
                            kind: CompletionItemKind.Keyword,
                            detail: 'Wildcard',
                            documentation: 'Každá odpoveď bude považovaná za valídnu.'
                        },
                    ]
                }
            }
            else{
                return null;
            }
        }
        if(lines[position.line].trim().includes("nextQuestion:")){
            for(let line = position.line - 1; line >= 0; line--){
                let previousLine = lines[line].trim();
                if(previousLine.length === 0 || previousLine === "saveAnswer"){
                    continue;
                }
                //nasiel som meno otazky
                if (/^\b[a-zA-Z0-9áéíóúäôčďľňřšťžýÁÉÍÓÚÄÔČĎĽŇŘŠŤŽÝ]+\b$/.test(previousLine)){
                    let questionName = (previousLine.match(/\b[a-zA-Z0-9áéíóúäôčďľňřšťžýÁÉÍÓÚÄÔČĎĽŇŘŠŤŽÝ]+\b/) || ["undefined"])[0]
                    
                    if(questionName === "undefined"){
                        continue
                    }

                    let questionNames = getAllQuestionNames(lines, questionName);
                    let res: CompletionItem[] = [];
                    for(let name of questionNames){
                        res.push({
                            label: name,
                            kind: CompletionItemKind.Field,
                            detail: `Odkaz na otázku ${name}`
                        })
                    }
                    return res;       
                }
            }
        }
        
        if(lines[position.line].trim().includes("option:")){
            return null;
        }
        if(position.line >= 2 && /^[a-zA-Z0-9áéíóúäôčďľňřšťžýÁÉÍÓÚÄÔČĎĽŇŘŠŤŽÝ]+$/.test(lines[position.line - 2].trim()) && 
           lines[position.line - 2].trim() != "saveAnswer" && 
           lines[position.line - 1].trim() != "saveAnswer" &&
           lines[position.line - 1].trim().length != 0 &&
           lines[position.line].trim().length === 0){
            return [
                {
                    label: 'saveAnswer',
                    kind: CompletionItemKind.Function,
                    detail: 'Uloží odpoveď na otázku.',
                    documentation: {
                        kind: 'markdown',
                        value: 'Použite `saveAnswer` na uloženie odpovede na otázku definovanú na predchádzajúcom riadku.'
                    }
                },
                {
                    label: 'option',
                    kind: CompletionItemKind.Keyword,
                    detail: 'Možnosť pre používateľa',
                    documentation: 'Predstavuje jednu z možností, ktorú môže používateľ vybrať.'
                },
                {
                    label: 'keywords',
                    kind: CompletionItemKind.Keyword,
                    detail: 'Možnosť pre používateľa',
                    documentation: 'Predstavuje jednu z možností, ktorú môže používateľ vybrať.'
                },
                {
                    label: 'nextQuestion',
                    kind: CompletionItemKind.Keyword,
                    detail: 'Možnosť pre používateľa',
                    documentation: 'Predstavuje jednu z možností, ktorú môže používateľ vybrať.'
                },
            ]
        }

        let items: CompletionItem[] = [
            {
                label: 'option',
                kind: CompletionItemKind.Keyword,
                detail: 'Možnosť pre používateľa',
                documentation: 'Predstavuje jednu z možností, ktorú môže používateľ vybrať.'
            },
            {
                label: 'keywords',
                kind: CompletionItemKind.Keyword,
                detail: 'Možnosť pre používateľa',
                documentation: 'Predstavuje jednu z možností, ktorú môže používateľ vybrať.'
            },
            {
                label: 'nextQuestion',
                kind: CompletionItemKind.Keyword,
                detail: 'Možnosť pre používateľa',
                documentation: 'Predstavuje jednu z možností, ktorú môže používateľ vybrať.'
            },
        ];

        let questionBlock = -1;
        for(let line = position.line - 1; line >= 3; line--){
            let previousLine = lines[line].trim();
            //nasiel som meno otazky
            if (/^\b[a-zA-Z0-9áéíóúäôčďľňřšťžýÁÉÍÓÚÄÔČĎĽŇŘŠŤŽÝ]+\b$/.test(previousLine) && previousLine != "saveAnswer") {
                questionBlock = line;
                break;
            }
        }

        if(questionBlock != -1 && (lines[questionBlock + 1].match(/\w+/g) || []).length >= 2){ //mame text otazky
            if(questionBlock + 1 === position.line) return;
            if(!lines[position.line].startsWith("\t")){
                console.log("jjo")
                return null;
            }
            let itemsToSend = items;   
            for(let i = questionBlock; i <  position.line; i++){
                if(lines[i].trim() === "saveAnswer") continue;
                if(lines[i].trim().length === 0){
                    itemsToSend = items;
                    continue;
                }
                if(lines[i].includes("option:")){
                    itemsToSend = itemsToSend.filter((v) => v.label != "option")    
                }
    
                if(lines[i].includes("keywords:")){
                    itemsToSend = itemsToSend.filter((v) => v.label != "keywords")    
                }
    
                if(lines[i].includes("nextQuestion:")){
                    itemsToSend = itemsToSend.filter((v) => v.label != "nextQuestion")    
                }
            }
            console.log("SOM TU")
            return itemsToSend;
        }
    }
    return null;
})

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
    if (item.label === 'saveAnswer') {
        item.detail = 'Odpoveď na túto otázku bude uložená';
        item.documentation = 'Toto je podrobnejší popis pre saveAnswer.';
    }

    if(item.label === "wildcard"){
        item.detail = "Znak pre hocijakú valídnu odpoveď"
        item.insertText = "*"
    }

    if(item.label === "keywords"){
        item.detail = "Množina kľúčových slov"
        item.insertText = "keywords:"
    }

    if(item.label === "option"){
        item.detail = "Text možnosti pre používateľa"
        item.insertText = "option:"
    }

    if(item.label === "nextQuestion"){
        item.detail = "Meno následujúcej otázky"
        item.insertText = "nextQuestion:"
    }

    if(item.label === "\!"){
        const replacement = "Tu doplňte prvú vetu chatbota\nTu doplňte poslednú vetu chatbota\n\nOtazka1\n\tText prvej otazky\n\tsaveAnswer\n\t\toption:\n\t\tkeywords:\n\t\tnextQuestion:\n\nOtazka2\n\tText druhej otazky\n\tsaveAnswer\n\t\toption:\n\t\tkeywords:\n\t\tnextQuestion:\n"
        item.insertText = replacement;

        item.additionalTextEdits = [
            {
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 1 }
                },
                newText: ""
            }
        ];
    }

    return item;
});

function getAllQuestionNames(lines: string[], currQuestionContextName?: string){
    let names = [];
    for(let line = 2; line < lines.length; line++){
        if(lines[line].trim().length === 0) continue;
        if(/^\s*\b[a-zA-Z0-9áéíóúäôčďľňřšťžýÁÉÍÓÚÄÔČĎĽŇŘŠŤŽÝ]+\b\s*$/.test(lines[line])){
            let questionName = (lines[line].match(/\b[a-zA-Z0-9áéíóúäôčďľňřšťžýÁÉÍÓÚÄÔČĎĽŇŘŠŤŽÝ]+\b/) || ["undefined"])[0]
            if(questionName !== "undefined" && questionName !== "saveAnswer" && questionName !== currQuestionContextName){
                names.push(questionName)
            }
        }
    }
    return names;
}

function getAllQuestionNamesWithSavedAnswer(lines: string[], currQuestionContextName?: string){
    let names = [];
    for(let i = 2; i < lines.length; i++){
        if(lines[i].trim().length === 0) continue;
        if(/^\s*\b[a-zA-Z0-9áéíóúäôčďľňřšťžýÁÉÍÓÚÄÔČĎĽŇŘŠŤŽÝ]+\b\s*$/.test(lines[i])){
            let questionName = (lines[i].match(/\b[a-zA-Z0-9áéíóúäôčďľňřšťžýÁÉÍÓÚÄÔČĎĽŇŘŠŤŽÝ]+\b/) || ["undefined"])[0];
            if(lines[i + 2] && lines[i + 2].includes("saveAnswer") && questionName !== "undefined" && questionName !== "saveAnswer" && questionName !== currQuestionContextName){
                names.push(questionName)
            }
        }
    }
    return names;
}

connection.onDidOpenTextDocument((params) => {
    checkFirstLine(params.textDocument);
});


function checkFirstLine(textDocument: TextDocumentItem) {
    const diagnostics: Diagnostic[] = [];
    const lines = textDocument.text.split('\n');

    if (lines.length > 0 && lines[0].trim() === '') {
        diagnostics.push({
            severity: DiagnosticSeverity.Information,
            range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 },
            },
            message: "Tu napíšte prvú vetu",
            source: 'moj-plugin',
        });
    }

    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

function staticAnalysis(document: TextDocument){
    const text = document.getText();
    const lineCount = document.lineCount;
    const lines = text.split("\n");
    const diagnostics: Diagnostic[] = [];

    if(lines[0].trim().length === 0 || lines[0].trim().split(" ").filter(p => p.length > 0).length <= 1){
        if(lines[0].trim().length === 0){
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: {line: 0, character: 0},
                    end: {line: 0, character: lines[0].length}
                },
                message: `Prvá veta chatbota nesmie byť prázdna`,
                code: "Error_5"
            })
        }
        else{
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: {line: 0, character: 0},
                    end: {line: 0, character: lines[0].length}
                },
                message: `Prvá veta chatbota musí obsahovať viac ako jedno slovo.`,
                code: "Error_5"
            })
        }
    }

    if(/\{[a-zA-Z0-9áéíóúäôčďľňřšťžýÁÉÍÓÚÄÔČĎĽŇŘŠŤŽÝ]+\}/g.test(lines[0])){
        const matches = lines[0].match(/\{[a-zA-Z0-9áéíóúäôčďľňřšťžýÁÉÍÓÚÄÔČĎĽŇŘŠŤŽÝ]+\}/g) || [];
        for(let match of matches){
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: {line: 0, character: lines[0].indexOf(match)},
                    end: {line: 0, character: lines[0].indexOf(match) + match.length}
                },
                message: `Prvá veta chatbota nemôže obsahovať placeholder`,
                code: "Error_5"
            })
        }
    }

    if(lines[1] && (lines[1].trim().split(" ").filter(p => p.length > 0).length <= 1 || lines[1].trim().length === 0)){
        if(lines[1].trim().length === 0){
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: {line: 1, character: 0},
                    end: {line: 1, character: lines[1].length}
                },
                message: `Druhá veta chatbota nesmie byť prázdna`,
                code: "Error_5"
            })
        }
        else{
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: {
                    start: {line: 1, character: 0},
                    end: {line: 1, character: lines[0].length}
                },
                message: `Druhá veta chatbota musí obsahovať viac ako jedno slovo.`,
                code: "Error_5"
            })
        }
    }
    
    let allQuestions = getAllQuestionNames(lines);
    let allQuestionsWithSaved = getAllQuestionNamesWithSavedAnswer(lines);
    let currQuestionName = "";
    for(let i = 1; i < lineCount; i++){
        const line = lines[i];
        if(/^[a-zA-Z0-9áéíóúäôčďľňřšťžýÁÉÍÓÚÄÔČĎĽŇŘŠŤŽÝ]+\s+$/.test(line)){ //riadok s nazvom otazky
            currQuestionName = line.trim();
            continue;
        }
        if(line === "\tsaveAnswer") continue;
        if(i === 1 || /\{[a-zA-Z0-9áéíóúäôčďľňřšťžýÁÉÍÓÚÄÔČĎĽŇŘŠŤŽÝ]+\}/g.test(line)){ //text otazky ktory ma placeholder
            let placeholders = (line.match(/\{[a-zA-Z0-9áéíóúäôčďľňřšťžýÁÉÍÓÚÄÔČĎĽŇŘŠŤŽÝ]+\}/g) || [])
            for(let placeholder of placeholders){
                if(!allQuestionsWithSaved.includes(placeholder.substring(1, placeholder.length - 1))){
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        range: {
                            start: {line: i, character: line.indexOf(placeholder)},
                            end: {line: i, character: line.indexOf(placeholder) + placeholder.length}
                        },
                        message: `Otazka ${placeholder.substring(1, placeholder.length - 1)} neexistuje alebo neukladá svoju odpoveď`,
                        code: "Error_1"
                    })
                }
            }
            continue;
        }
        if(line.includes("nextQuestion:")){
            let nextQuestioName = line.split(":")[1].trim();
            if(nextQuestioName.length === 0){
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: {line: i, character: line.indexOf("nextQuestion:")},
                        end: {line: i, character: line.indexOf("nextQuestion:") + "nextQuestion:".length}
                    },
                    message: `Meno následujúcej otázky nemôže byť prázdne`,
                    code: "Error_3",                    
                })
                continue;
            }
            
            if(!allQuestions.includes(nextQuestioName)){
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: {line: i, character: line.indexOf(nextQuestioName)},
                        end: {line: i, character: line.indexOf(nextQuestioName) + nextQuestioName.length}
                    },
                    message: `Otazka ${nextQuestioName} neexistuje`,
                    code: "Error_2",                    
                })
            }
            else if(nextQuestioName === currQuestionName){
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: {line: i, character: line.indexOf(nextQuestioName)},
                        end: {line: i, character: line.indexOf(nextQuestioName) + nextQuestioName.length}
                    },
                    message: `Táto odpoveď odkazuje na svoju otázku, chatbot bude zacyklený.`,
                    code: "Warning_1"
                })
            }
            continue;
        }
        if(line.includes("keywords:")){
            let keywords = line.split(":")[1].trim().split(" ").filter(k => k.length != 0)
            if(keywords.length === 0){
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: {line: i, character: line.indexOf("keywords:")},
                        end: {line: i, character: line.indexOf("keywords:") + "keywords:".length}
                    },
                    message: `Množina kľučových slov nemôže byť prázdna`,
                    code: "Error_4",                    
                })
                continue;
            }
            if(keywords.includes("*") && keywords.length > 1){
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: {line: i, character: line.indexOf("*")},
                        end: {line: i, character: line.indexOf("*") + 1}
                    },
                    message: `Znak '*' berie všetky slová. Buď odstráň '*' alebo ostatné kľučové slová`
                })
            }
        }
        if(line.includes("option:")){
            let option = line.split(":")[1].trim()
            if(option.length === 0){
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: {line: i, character: line.indexOf("option:")},
                        end: {line: i, character: line.indexOf("option:") + "option:".length}
                    },
                    message: `Možnosť nemôže byť prázdna`,
                    code: "Error_5",                    
                })
                continue;
            }
        }
    }
    
    
    return diagnostics;
}

documents.onDidChangeContent((change) => {
    const diags = staticAnalysis(change.document)

    connection.sendDiagnostics({
        uri: change.document.uri,
        diagnostics: diags
    })
})


documents.listen(connection);
connection.listen();
