# Apply Command

Apply external command to current file or selection

* execute external command.
* feed file content or selected text to command input.
* replace file content or selection with command output.

Commands are defined in .json file and can execute via editors context menu.

![menu](https://raw.githubusercontent.com/wiki/clworld/apply-command/images/menu.png)

## Modes
* "mode": "replace-command":  
  execute command for each selections if multiple selections exists.
* "mode": "replaceMulti-command':  
  feed multiple selections at once as nul('\0') separated text.  
  command must be capable of processing nul('\0').  
  sample: sample2.json

## TODO
* multiple file (I think run xargs is simpler solution.)

## Notice
* This plugin simply execute command written in config file. Check command safe before execute.
* Processing huge file may slow (currently this plugin treat file as sigle String).
