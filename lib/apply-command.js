var path = require('path');
var fs = require('fs-plus');
var Atom = require('atom');
var CompositeDisposable = Atom.CompositeDisposable;
var BufferedProcess = Atom.BufferedProcess;

module.exports = {
  packagename: 'apply-command',
  subscriptions: null,
  menuItem: null,
  contextMenu: null,
  sampleDir: path.join(__dirname, '../samples'),
  config: {
      commandDirectory: {
      type: 'string',
      default: path.join(atom.config.getUserConfigPath(), '../.apply-command/commands')
    },
  },

  activate: function (state) {
    this.subscriptions = new CompositeDisposable();
    this.menuItem = new CompositeDisposable();

    this.checkAndCreateCommandDirectory();

    // コンテキストメニュー作成
    this.setupCommand();
  },

  deactivate: function () {
    this.subscriptions.dispose();
    this.menuItem.dispose();
  },

  serialize: function () {
    return {
    };
  },

  checkAndCreateCommandDirectory: function () {
    // コマンド保存ディレクトリ
    this.sampleDir;
    var commandDir = this.getCommandDirectory();
    if (!fs.isDirectorySync(commandDir)) {
      fs.makeTreeSync(commandDir);
      fs.copySync(this.sampleDir, commandDir);
    }
  },

  setupCommand: function () {
    var self = this;
    // コンテキストメニュー作成
    var commandArray = this.generateCommandArray();
    var commandBindings = {};
    this.createContextMenu(commandArray);
    for (var i = 0; i < commandArray.length; i++) {
      function createCallback(command) {
        return function (event) {
          self.applyCommand(command);
        };
      }
      commandBindings[commandArray[i].commandName] = createCallback(commandArray[i]);
    }
    commandBindings[this.packagename + ':reload-command'] = function (event) {
      self.reloadCommand();
    };
    commandBindings[this.packagename + ':view-command-folder'] = function (event) {
      self.viewCommandFolder();
    };
    commandBindings[this.packagename + ':view-sample-folder'] = function (event) {
      self.viewSampleFolder();
    };
    this.subscriptions.add(atom.commands.add(
      'atom-workspace',
      commandBindings
    ));
  },

  reloadCommand: function () {
    this.subscriptions.dispose();
    this.setupCommand();
  },

  applyCommand: function (info) {
    var mode = "replace-command";
    if (info.metadata.mode) {
      mode = info.metadata.mode;
    }
    switch (mode) {
      case 'replace-command':
        this.runReplaceCommand(info);
        break;
      case 'replaceMulti-command':
        this.runReplaceMultiCommand(info);
        break;
      default:
        atom.notifications.addError("Apply command: unknown mode", {
          detail: "Unknown mode: " + mode + " specified.\nCommand: " + info.identifier,
          dismissable: true,
        });
    }
  },
  // 何かが選択されてるか判定
  isSomethingSelected: function (selections) {
    var isSelected = false;
    for (var i = 0; i < selections.length; i++) {
      if (!selections[i].isEmpty()) {
        isSelected = true;
        break;
      }
    }
    return isSelected;
  },
  applyReplaceResult: function (editor, selections, resultArray) {
    editor.transact(function () {
      for (var i = 0; i < selections.length; i++) {
        if (!selections[i].isEmpty()) {
          var range = selections[i].getBufferRange();
          editor.setTextInBufferRange(range, resultArray[i]);
        }
      }
    });
  },
  runReplaceCommand: function (info) {
    var self = this;
    var editor = atom.workspace.getActiveTextEditor();
    if (editor) {
      var selections = editor.getSelections();
      if (this.isSomethingSelected(selections)) {
        // 選択領域
        var processedCount = 0;
        var resultArray = [];
        for (var i = 0; i < selections.length; i++) {
          resultArray[i] = "";
        }
        function createResultHander(index) {
          return function (result) {
            processedCount += 1;
            resultArray[index] = result;
            if (selections.length == processedCount) {
              self.applyReplaceResult(editor, selections, resultArray);
            }
          };
        }
        for (var i = 0; i < selections.length; i++) {
          if (!selections[i].isEmpty()) {
            var text = selections[i].getText();
            this.runCommand(info, text, createResultHander(i));
          } else {
            processedCount += 1; // コマンド実行不要だった
          }
        }
      } else {
        // ファイル全体
        var text = editor.getText();
        this.runCommand(info, text, function (result) {
          editor.setText(result);
        });
      }
    }
  },
  runReplaceMultiCommand: function (info) {
    var self = this;
    var editor = atom.workspace.getActiveTextEditor();
    if (editor) {
      var selections = editor.getSelections();
      if (this.isSomethingSelected(selections)) {
        // 選択領域
        var textArray = [];
        for (var i = 0; i < selections.length; i++) {
          textArray[i] = "";
          if (!selections[i].isEmpty()) {
            textArray[i] = selections[i].getText().replace(/\0/g, '');
          }
        }
        var text = textArray.join("\0");
        this.runCommand(info, text, function (result) {
          var resultArray = result.split("\0");
          if (textArray.length == resultArray.length) {
            self.applyReplaceResult(editor, selections, resultArray);
          } else {
            atom.notifications.addError("Apply command: replaceMulti failed" + mode, {
              detail: "input text count != result text count.\n"
                + "Is this command support nul(\\0) separated text?"
                + "\nCommand: " + info.identifier,
              dismissable: true,
            });
          }
        });
      } else {
        // ファイル全体
        var text = editor.getText();
        this.runCommand(info, text, function (result) {
          editor.setText(result);
        });
      }
    }
  },
  runCommand: function (info, text, callback) {
    var command = info.metadata.command;
    var args = info.metadata.args;
    var output = [];
    var bp = new BufferedProcess({
      command: command,
      args: args,
      options: {
        cwd: this.getCommandDirectory(),
      },
      stdout: function (data) { output.push(data); },
      stderr: function (data) { output.push(data); },
      exit: function (code) {
        if (0 < code) {
          output.push("Error?: cmd:" + command + " " + args.join(" "));
        }
        callback(output.join(""));
      },
    });
    bp.process.stdin.end(text, 'utf8');
  },

  // コマンド保存ディレクトリ
  getCommandDirectory: function () {
    return atom.config.get('apply-command.commandDirectory');
  },
  // json読み込み
  parseMetaData: function (filename) {
    var content = fs.readFileSync(filename, 'utf8');
    var data = JSON.parse(content);
    return data;
  },
  // コマンド一覧作成
  generateCommandArray: function () {
      var files = fs.listSync(this.getCommandDirectory(), ['json']);
      var commands = [];

      for (var i = 0; i < files.length; i++) {
        var metadata = this.parseMetaData(files[i]);
        var identifier = path.basename(files[i], '.json').replace('.', '');
        if (metadata) {
          commands.push({
              filename: files[i],
              identifier: identifier,
              metadata: metadata,
              commandName: this.packagename + ':apply-' + identifier
          });
        }
      }
      return commands;
  },
  // コンテキストメニュー化
  createContextMenu: function (commandArray) {
    if (this.contextMenu) {
      // 再作成時にはMenuをとりあえず全部消す(atomに渡した後の配列を編集するのは危険な気もする)
      while (this.contextMenu.length > 0) {
        this.contextMenu.pop();
      }
    }
    var availableCommands = [];
    this.contextMenu = availableCommands;
    for (var i = 0; i < commandArray.length; i++) {
      availableCommands.push({
          label: commandArray[i].metadata.commandName,
          command: commandArray[i].commandName
      });
    }
    availableCommands.push({
        type: 'separator'
    });
    availableCommands.push({
        label: 'Reload command',
        command: this.packagename + ':reload-command',
    });
    availableCommands.push({
        label: 'View command directory',
        command: this.packagename + ':view-command-folder',
    });
    availableCommands.push({
        label: 'View command sample directory',
        command: this.packagename + ':view-sample-folder',
    });
    this.menuItem.add(atom.contextMenu.add({
      'atom-text-editor': [{
        label: 'Apply command',
        submenu: availableCommands,
      }],
    }));
  },
  // コマンドフォルダを開く用のコマンド
  fileManagerCommandForPath: function (directory) {
    var output = {};
    switch (process.platform) {
      case 'darwin': {
        output = {
          command: 'open',
          label: 'Finder',
          args: ['-R', directory]
        };
        break;
      }
      case 'win32': {
        output = {
          args: [directory],
          label: 'Explorer'
        };

        if (process.env.SystemRoot) {
          output.command = path.join(process.env.SystemRoot, 'explorer.exe');
        } else {
          output.command = 'explorer.exe';
        }
        break;
      }
      default: {
        output = {
          command: 'xdg-open',
          label: 'File Manager',
          args: [directory]
        };
        break;
      }
    }
    return output;
  },
  // サンプルフォルダを開く
  viewSampleFolder: function () {
    this.viewFolder(this.sampleDir);
  },
  // コマンドフォルダを開く
  viewCommandFolder: function () {
    var commandDirectory = this.getCommandDirectory();
    this.viewFolder(commandDirectory);
  },
  // コマンドフォルダを開く
  viewFolder: function (folder) {
    var ref = this.fileManagerCommandForPath(folder);
    var errorLines = [];

    var stderr = function(lines) {
        return errorLines.push(lines);
    };

    var handleError = function(errorMessage) {
      return atom.notifications.addError(
        'Opening ' + commandDirectory + ' failed', {
          detail: errorMessage,
          dismissable: true,
        }
      );
    };

    var exit = function(code) {
      var failed = code !== 0;
      var errorMessage = errorLines.join('\n');
      if (process.platform === 'win32' && code === 1 && !errorMessage) {
        failed = false;
      }
      if (failed) {
          return handleError(errorMessage);
      }
    };

    var showProcess = new BufferedProcess({
      command: ref.command,
      args: ref.args,
      stderr: stderr,
      exit: exit,
    });

    return showProcess.onWillThrowError(function(arg) {
      var error = arg.error;
      var handle = arg.handle;
      handle();
      return handleError(error !== null ? error.message : void(0));
    });
  },
};
