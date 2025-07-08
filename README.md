# Questxt
Or "Quest.txt", a simple todo list system, inspired by [todo.txt](https://github.com/todotxt/todo.txt-cli), but more game-ified, with EXP and levelling! And maybe more things one way, who knows.<br>

## CLI
Adding a new quest is simple text.

```bash
quest add "This is a new quest! #testing [100]"
quest sort-priority #sorts quests by priority
quest sort-state
quest sort-project
```
<br>
Searching quests can use some semi-advanced filters.

```bash
quest show "new" -t testing -exp 10
quest ls #shows all quests
quest ls --project code #shows all quests in code project
```

This shows quests with "new" in the text, with `#testing` tag, and that would give 10 EXP.<br>
Also supported is, `--project <name>`, `--key <name>`, `--priority <number>`, `--state <name>`<br>
<br>
Completing quests.

```bash
quest done "new" #completes quest with text containing value, errors if more than one is found
quest done "new" -m #completes ALL quests matching the filter if `-m` is added
quest done --project code -m #completes all quests in code project
quest delete "new" # DELETES the quest from the file instead of marking as complete
quest archive #moves all quests out of the main quest file and in to an archive file
```

Modifying quests in the CLI.<br>
While it's easy enough to modify quests in the text editor using the simple syntax, there are also commands to modify the quests.

```bash
# Using the earlier quest as an example.

quest modify "new" --new-project "testing"
quest modify "new" --append-text "#experimental"
quest modify "new" --prepend-text "I dare say"
quest modify "new" --replace-text "This" --replace-with "this"
```

<br><br>

Change settings for the quest file.<br>
Values can be arbitrary, left open for future scripting and extensions support.<br>
Some values are used internally;<br>
`editor` changes the text editor called.<br>
`disableColours`, `disableColour`, `disableColors`, `disableColor` all disable text formatting
`settings.dateFormat` changes the format used for the dates, see [DayJS Format docs](https://day.js.org/docs/en/display/format) for details.

```bash
quest set editor vim
quest set goal:int 100
quest unset goal
quest settings
```

<br>
<br>
Misc commands.

```bash
quest gainexp 100 #Gain some EXP, mostly for testing purposes, shouldn't need to be called manually unless you need to manually adjust something.
quest status #shows current status
quest edit #opens quest file in editor
```

## Build
Requires [Bun](https://bun.sh) runtime.<br>
Either run as a script with `bun quest.js [arguments]` from the script directory, or run the build script with `bun b` to automatically compile<br>
and move the executable to ~/.local/bin for global use. (Linux only)

## Examples
The top of the quest text file can contain settings values.

```
@settings.editor hx
```

This example is the main important one, which decides what editor the CLI will use to edit the text file when the `edit` command is used.<br><br>

A complete quest line;

```
* FAILED 22:55 04-07-2025: Finish this quest system. #coding @quest [500] (100) $q1
```
- Line starts with "*"
- Optionally starts with a state name, one of `["TODO", "DOING", "DONE", "PAUSED", "FAILED"]`
- Optionally followed by text with `HH:mm DD-MM-YYYY: ` to mark quest as completed
- contains text
- Optionally any number of tags marked `#tag1` `#tag2` `#etc`
- Optionally assign a project with `@projectName`
- Optionally assign a key with `$keyName`
- Optionally assign EXP reward for completion with `[exp number]`
- Optionally assign priority with `(priority number)`

Most of these keys are completely optional, and quests can just be text.

```
* This is a complete quest.
```
