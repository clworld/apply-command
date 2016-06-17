# Apply Command

Apply external command to current file or selection

* execute external command.
* feed file content or selected text to command input.
* replace file content or selection with command output.

Commands are defined in .json file and can execute via editors context menu.

![menu](https://raw.githubusercontent.com/wiki/clworld/apply-command/images/menu.png)

# TODO
* multiple file (xargs may simple solution)

# Notice
* This plugin simply execute command written in config file. Check command safe before execute.
* Processing huge file may slow (currently this plugin treat file as sigle String).
