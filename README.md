# Chatbot DSL Extension
VSC Plugin for university project

## Features
- Static code analysis 
- Compilation to web page
![compilation gif](/assets/two.gif)
- autocompletion
![autocompletion gif](/assets/one.gif)
- syntax highlighting
![syntax highlighting img](/assets/highlighting.png)

## Build extension
To build this extension you should run ```npm run build```.

## Test extension
You can test this extension without installing it! You just need to build this project, open this project in VSC and then press ```F5```.
This should open new VSC window with this extension running.

## Adding chatbot compiler
To use compilation button, you will need to build this project, then build Java project using ```package``` lifecycle hook in maven and add generated JAR file to
```out/client/src``` with name ```Chatbot_DSL_Compiler.jar```.

## Installing extesion
You can install this extension on your local machine using these steps.
- build this project
- run ```vsce package```
- open VSC command panel ```CTRL + SHIFT + P```
- select ```Extensions: Install from VSIX```
- select file generated from step 2
