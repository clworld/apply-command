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
  config: {
      commandDirectory: {
      type: 'string',
      default: path.join(__dirname, '../commands')
    },
  },

  activate: function (state) {
    this.subscriptions = new CompositeDisposable();
    this.menuItem = new CompositeDisposable();

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
    var editor = atom.workspace.getActiveTextEditor();
    if (editor) {
      var selection = editor.getSelectedText();
      if (selection) {
        // 選択領域
        var range = editor.getSelectedBufferRange();
        this.runCommand(info, selection, function (result) {
          editor.setTextInBufferRange(range, result);
        });
      } else {
        // ファイル
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
        var identifier = path.basename(files[i]).replace('.', '');
        if (metadata) {
          commands.push({
              filename: files[i],
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
  // コマンドフォルダを開く
  viewCommandFolder: function () {
    var commandDirectory = this.getCommandDirectory();
    var ref = this.fileManagerCommandForPath(commandDirectory);
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
