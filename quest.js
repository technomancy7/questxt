//const argParser = require('yargs-parser')
import argParser from 'yargs-parser'
import { $ } from "bun";
const dayjs = require('dayjs')
var relativeTime = require("dayjs/plugin/relativeTime");
dayjs.extend(relativeTime)
var customParseFormat = require("dayjs/plugin/customParseFormat");
dayjs.extend(customParseFormat);
var duration = require("dayjs/plugin/duration");
dayjs.extend(duration);
var updateLocale = require('dayjs/plugin/updateLocale')

dayjs.extend(updateLocale, {
  thresholds: [
    { l: 's', r: 1 }, { l: 'm', r: 1 }, { l: 'mm', r: 59, d: 'minute' }, { l: 'h', r: 1 }, { l: 'hh', r: 23, d: 'hour' },
    { l: 'd', r: 1 }, { l: 'dd', r: 29, d: 'day' }, { l: 'M', r: 1 }, { l: 'MM', r: 11, d: 'month' },  { l: 'y', r: 1 }, { l: 'yy', d: 'year' }
  ]
})

dayjs.updateLocale('en', {
  relativeTime: {
    future: "in %s", past: "%s ago", s: 'a few seconds', m: "a minute", mm: "%d minutes", h: "an hour", hh: "%d hours", d: "a day",
    dd: "%d days", M: "a month", MM: "%d months", y: "a year", yy: "%d years"
  }
})

export class Questing {
    constructor() {
        this.questFile = process.env.QUESTXT_FILE || process.env.HOME+"/.quests.txt";
        this.questArchive = process.env.QUESTXT_FILE || process.env.HOME+"/.quests.archive.txt";
        this.quests = [];
        this.settings = {};

        this.scriptHooks = [];
        this.scriptHookPaths = [];
        this.commandHooks = {
            "quest_added": [],
            "quest_deleted": [],
            "quest_completed": [],
            "quest_modified": [],
            "quests_archived": [],
            "exp_gained": [],

        }

        this.priorityRe = /\(\d+\)/g; // Matches (number)
        this.expRe = /\[\d+\]/g; // Matches [number]
        this.keyRe = /\$[a-zA-Z0-9]+/g; // Matches $key
        this.tagsRe = /\#[a-zA-Z0-9!]+/g; // Matches #tag
        this.projectRe = /\@[a-zA-Z0-9]+/g; // Matches @project
        this.propsRe = /{[a-z]+:[\w\d\s,.!?]*}/g; //Matches {key:[value]}
        this.states = ["TODO", "DOING", "DONE", "PAUSED", "FAILED", "WAIT"]
    }

    colours() {
        return {
            "reset": '\033[0m',
            "red": Bun.color("red", "ansi"),
            "green": Bun.color("green", "ansi"),
            "blue": Bun.color("blue", "ansi"),
            "cyan":Bun.color("cyan", "ansi"),
            "orange":Bun.color("orange", "ansi"),
            "yellow": Bun.color("yellow", "ansi"),
            "purple": Bun.color("purple", "ansi"),
            "grey": Bun.color("grey", "ansi"),
            "gray": Bun.color("gray", "ansi"),
            "bold": "\u001b[1m",
            "dim": "\u001b[2m",
            "italic": "\u001b[3m",
            "underline": "\u001b[4m",
            "blink": "\u001b[5m",
            "reverse": "\u001b[7m",
            "hidden": "\u001b[8m",
            "strike_through": "\u001b[9m",
        }
    }

    colour(c) {
        if(this.settings.plaintext == "true" || this.settings.plaintext == "") return "";

        let fmtCodes = this.colours();

        let f = fmtCodes[c];
        if(f == undefined) return fmtCodes.reset;
        return f;
    }

    gainEXP(gained) {
        if(gained <= 0) return;

        let exp = Number(this.settings.exp);
        let level = Number(this.settings.level);
        let expToLevel = Math.floor(100 * level * 1.2);

        exp = exp + gained;

        if(this.settings.silenceEXPGain != "true" && this.settings.silenceEXPGain != "")
            console.log(this.colour("green")+`Gained ${gained} EXP. (Lvl. ${level}, ${exp}/${expToLevel})${this.colour("reset")}`)

        if(exp >= expToLevel) {
            exp = exp - expToLevel;
            level = level + 1;

            if(this.settings.silenceLevelUp != "true" && this.settings.silenceLevelUp != "")
                console.log(this.colour("orange")+`Level up! Now level ${level}${this.colour("reset")}`)
        }
        this.settings.exp = `${exp}`;
        this.settings.level = `${level}`;
    }

    resetState() {
        this.quests = {};
        this.settings = {};
    }

    sortEntriesByProject(reverse = false) {
        this.quests.sort((a, b) => a.project.localeCompare(b.project));
    }

    sortEntriesByState(reverse = false) {
        this.quests.sort((a, b) => a.state.localeCompare(b.state));
    }

    sortEntriesByText(reverse = false) {
        this.quests.sort((a, b) => a.text.localeCompare(b.text));

    }

    sortEntriesByPriority(reverse = false) {
        this.quests.sort((a, b) => {
            if(!reverse) return a.priority - b.priority;
            if(reverse) return b.priority - a.priority;
        });
    }

    async editFile(entryFile = false) {
        let editor = this.settings.editor || Bun.env.EDITOR || null
        if(editor != null) {
            await $`${editor} ${this.questFile}`;
        } else {
            console.log("No editor defined. Use either `@settings.editor <executable>` settings property, or ENV EDITOR.")
        }

    }

    defaultQuest() {
        return {
            project: "",
            tags: [],
            completedAt: "",
            priority: 0,
            exp: 0,
            text: "",
            key: "",
            state: "",
            properties: {},
        }
    }

    parseQuestLine(text) {
        let quest = this.defaultQuest();

        function startsWithDateTime(text) {
            const regex = /^\d{2}:\d{2} \d{2}-\d{2}-\d{4}: /;
            return regex.test(text);
        }

        for(const state of this.states) {
            if(text.toUpperCase().startsWith(state)) {
                quest.state = state;
                text = text.slice(state.length+1);
                break;
            }
        }

        if(startsWithDateTime(text)) {
            quest.completedAt = text.slice(0, 16);
            text = text.slice(18);
        }

        let priority = text.match(this.priorityRe);
        if(priority) quest.priority = parseInt(priority[0].slice(1, -1));

        let exp = text.match(this.expRe)
        if(exp) quest.exp = parseInt(exp[0].slice(1, -1));

        let project = text.match(this.projectRe)
        if(project) quest.project = project[0].slice(1);

        let key = text.match(this.keyRe)
        if(key) quest.key = key[0].slice(1);

        let tags = text.match(this.tagsRe) || []
        quest.tags = tags.map((t) => { return t.slice(1) });

        let props = text.match(this.propsRe) || [];
        for(const prop of props) {
            quest.properties[prop.split(":")[0].slice(1)] = prop.split(":").slice(1).join(":").slice(0, -1).trim()
        }

        quest.text = text
            .replace(this.priorityRe, '')
            .replace(this.expRe, '')
            .replace(this.keyRe, '')
            .replace(this.propsRe, '')
            .replace(this.projectRe, '')
            .trim();
        this.quests.push(quest);
        return quest;
    }

    parseSetting(line) {
        let key = line.split(" ")[0];
        let value = line.split(" ").slice(1).join(" ");

        this.settings[key] = value;
    }

    dispatchScriptHook(hookType, data = {}) {
        //console.log(this.scriptHooks)
        for(const hook of this.scriptHooks){
            //console.log(hook)
            if(hook[hookType] != undefined) hook[hookType](this, data);
        }
    }

    async loadFile(path = undefined) {
        if(path == undefined) path = this.questFile;
        const i = Bun.file(path);
        const exists = await i.exists();

        if(exists) {
            const lines = await i.text()

            for(const line of lines.split("\n")) {
                if(line == "" || line == "---") continue;

                if(line.startsWith("@settings.")) {
                    this.parseSetting(line.slice("@settings.".length))

                } else if(line.startsWith("@hooks.import ")){
                    let scriptPath = line.slice("@hooks.import ".length);
                    this.scriptHookPaths.push(scriptPath);

                    if(!scriptPath.includes("/") && !scriptPath.endsWith(".js")) {
                        scriptPath = `${Bun.env.HOME}/.quests/${scriptPath}.js`
                    }
                    const hook = require(scriptPath);
                    if(hook.loaded != undefined) hook.loaded(this);
                    this.scriptHooks.push(hook);


                } else if(line.startsWith("* ")) {
                    if(line.slice(2) != "") this.parseQuestLine(line.slice(2))
                }

            }
        }
    }

    formatQuest(q) {
        let ln = q.text;
        if(q.priority != 0) ln = `(${q.priority}) ${ln}`;
        if(q.completedAt) ln = `${q.completedAt}: ${ln}`;
        if(q.state != "") ln = `${q.state} ${ln}`

        if(q.key != "") ln = ln + ` $${q.key}`;
        if(q.project != "") ln = ln + ` @${q.project}`;

        if(q.exp != 0) ln = ln + ` [${q.exp}]`;

        for(const [key, val] of Object.entries(q.properties)) {
            ln = ln + ` {${key}:${val}}`
        }
        ln = `* ${ln}`.trim().replace(/ {1,}/g," ");;
        return ln;
    }


    colourQuest(q) {
        return this.colourQuestLine(this.formatQuest(q))
    }

    colourQuestLine(ql) {
        let f = this.colour;

        if(ql.includes("TODO ")) ql = ql.replace("TODO ", `${this.colour('yellow')}${this.colour('bold')}TODO ${this.colour('reset')}`)
        if(ql.includes("FAILED ")) ql = ql.replace("FAILED ", `${this.colour('red')}${this.colour('bold')}FAILED ${this.colour('reset')}`)

        if(ql.includes("DONE ")) ql = ql.replace("DONE ", `${this.colour('green')}${this.colour('bold')}DONE ${this.colour('reset')}`)
        if(ql.includes("DOING ")) ql = ql.replace("DOING ", `${this.colour('cyan')}${this.colour('bold')}DOING ${this.colour('reset')}`)
        if(ql.includes("PAUSED ")) ql = ql.replace("PAUSED ", `${this.colour('gray')}${this.colour('bold')}PAUSED ${this.colour('reset')}`)
        if(ql.includes("WAIT ")) ql = ql.replace("WAIT ", `${this.colour('gray')}${this.colour('bold')}WAIT ${this.colour('reset')}`)

        let priority = ql.match(this.priorityRe);
        if(priority) ql = ql.replace(priority[0], `${this.colour('red')}${priority[0]}${this.colour('reset')}`)

        let exp = ql.match(this.expRe)
        if(exp) ql = ql.replace(exp[0], `${this.colour('green')}${exp[0]}${this.colour('reset')}`)

        let project = ql.match(this.projectRe)
        if(project) ql = ql.replace(project[0], `${this.colour('yellow')}${project[0]}${this.colour('reset')}`)

        let key = ql.match(this.keyRe)
        if(key) ql = ql.replace(key[0], `${this.colour('cyan')}${key[0]}${this.colour('reset')}`)

        let tags = ql.match(this.tagsRe) || []

        for(const tag of tags) {
            ql = ql.replace(tag, `${this.colour('purple')}${tag}${this.colour('reset')}`)
        }


        let props = ql.match(this.propsRe) || [];
        for(const prop of props) {
            let key = prop.split(":")[0].slice(1);
            let val = prop.split(":").slice(1).join(":").slice(0, -1).trim();
            let fmtProp = `{${key}:${val}}`
            let fmtPropCol = `${this.colour('red')}{${this.colour('grey')}${key}${this.colour('reset')}:${this.colour('gray')}${val}${this.colour('red')}}${this.colour('reset')}`
            ql = ql.replace(fmtProp, fmtPropCol)
        }


        return ql;
    }

    async exportFile(path = null, questsOverride = null, settingsOverride = null) {
        if(path == null) path = this.questFile;
        let settingsObj = settingsOverride || this.settings;
        let questsObj = questsOverride || this.quests;
        let text = [];

        if(Object.keys(settingsObj).length > 0){
            for(let [key, val] of Object.entries(settingsObj)) {
                text.push(`@settings.${key} ${val}`.trim())
            }
        }

        for(let scriptPath of this.scriptHookPaths) {
            text.push("@hooks.import "+scriptPath);
        }
        text.push("---")
        for (const q of questsObj) {
            text.push(this.formatQuest(q))
        }

        await Bun.write(path, text.join("\n").trim()); //console.log(text.join("\n"))
    }
}

if(import.meta.main) {
    await main()
}

async function main() {
    let q = new Questing();
    await q.loadFile();
    const args = argParser(process.argv.slice(2), {
        alias: {
            disableColour: ["disable-colours", "disable-color", "disable-colors", "dc"],
            help: ["h"],
            editor: ['e'],
            value: ["v"]

        }
    });

    let quests = [];

    function filterQuests(includeCompleted = false) {
        let output = []
        for(const quest of q.quests) {
            let accepted = false;
            let denied = false;

            if(!includeCompleted && quest.completedAt != "") continue;

            if(args.key && quest.key != args.key) denied = true;
            if(args.state && quest.state != args.state) denied = true;
            if(args.exp && quest.exp != parseInt(args.exp)) denied = true;
            if(args.priority && quest.priority != parseInt(args.priority)) denied = true;
            if(args.project && quest.project != args.project) denied = true;
            if(args.tag && !quest.tags.includes(args.tag)) denied = true;
            if(args._.slice(1).length > 0 && !quest.text.includes(args._.slice(1).join(" "))) denied = true;

            if(!denied) output.push(quest)

        }
        return output;
    }

    function printSettings() {
        for(const [k, v] of Object.entries(q.settings)) {
            console.log(` ${q.colour('orange')}${k}${q.colour('reset')}\t\t${q.colour('orange')}${v}${q.colour('reset')}`)
        }
    }
    switch (args._[0]) {
        case "help":
            console.log("QUESTXT")
            console.log("")
            console.log("Commands:")
            console.log(" add [quest syntax]")
            console.log(" done [filter syntax]")
            console.log(" modify [filter syntax]")
            console.log(" get [filter syntax]")
            console.log(" delete [filter syntax]")
            console.log(" ls")
            console.log(" edit")
            console.log(" archive")
            console.log(" unset [key]")
            console.log(" set [settings syntax]")
            console.log(" unset [key]")
            console.log(" settings")
            console.log(" gainexp [number]")
            console.log(" status")
            console.log(" sort-project")
            console.log(" sort-state")
            console.log(" sort-priority")
            console.log(" sort-text")
            break;

        case "print":
            console.log(q.quests)
            break;

        case "unset":
            if(args.h) {
                console.log(`unset

                Input:
                    text (Settings key to erase)
                `.replace(/  +/g, ''))
                return
            }
            delete q.settings[args._.slice(1).join(" ")];
            await q.exportFile()
            printSettings()
            break;

        case "set":
            if(args.h) {
                console.log(`set

                Input:
                    text (Settings syntax, e.g. editor hx, key-only for a boolean setting)
                `.replace(/  +/g, ''))
                return
            }
            let new_setting = args._.slice(1).join(" ");
            q.parseSetting(new_setting);
            await q.exportFile()
            printSettings()
            break;

        case "settings":
            if(args.h) {
                console.log(`settings

                No additional input.
                `.replace(/  +/g, ''))
                return
            }
            printSettings()
            break

        case "gainexp":
            if(args.h) {
                console.log(`gainexp

                Input:
                    number (Experience points to give)
                `.replace(/  +/g, ''))
                return
            }
            q.gainEXP(parseInt(args._[1]));
            q.exportFile()
            break;

        case "status":
            if(args.h) {
                console.log(`status

                No additional input.
                `.replace(/  +/g, ''))
                return
            }
            let expToLevel = Math.floor(100 * Number(q.settings.level) * 1.2);
            console.log(`Level ${q.settings.level}, ${q.settings.exp}/${expToLevel}`)
            break;

        case "sort-project":
            if(args.h) {
                console.log(`sort

                Args:
                    -r (Reverses order)

                `.replace(/  +/g, ''))
                return
            }
            q.sortEntriesByProject(args.r || false);
            await q.exportFile();
            for(const quest of q.quests) {
                console.log(q.colourQuest(quest))
            }
            break;

        case "sort-text":
            if(args.h) {
                console.log(`sort

                Args:
                    -r (Reverses order)

                `.replace(/  +/g, ''))
                return
            }
            q.sortEntriesByText(args.r || false);
            await q.exportFile();
            for(const quest of q.quests) {
                console.log(q.colourQuest(quest))
            }
            break;

        case "sort-priority":
            if(args.h) {
                console.log(`sort

                Args:
                    -r (Reverses order)

                `.replace(/  +/g, ''))
                return
            }
            q.sortEntriesByPriority(args.r || false);
            await q.exportFile();
            for(const quest of q.quests) {
                console.log(q.colourQuest(quest))
            }
            break;

        case "sort-state":
            if(args.h) {
                console.log(`sort

                Args:
                    -r (Reverses order)

                `.replace(/  +/g, ''))
                return
            }
            q.sortEntriesByState(args.r || false);
            await q.exportFile();
            for(const quest of q.quests) {
                console.log(q.colourQuest(quest))
            }
            break;

        case "modify":
        case "mod":
        case "m":
            if(args.h) {
                console.log(`modify
                Input:
                    text (used to search text of quests)

                Args:
                    --project <name>
                    --key <name>
                    --tag <tag>
                    --exp <number>
                    --priority <number>
                    --state <name>

                    --new-project <name> (Changes project)
                    --new-key <name> (Changes key)
                    --new-tags <tag> (List of tags separate by ",")
                    --new-exp <number> (Changes EXP)
                    --new-priority <number> (Changes priority)
                    --new-state <name> (Changes state)
                    --new-text <text> (Replaces entire body of text)
                    --prepend-text <text> (Adds text to the start)
                    --append-text <text> (Adds text to end)
                    --replace-text <text> (Replaces text within string with value of --replace-with)
                    --set-prop <key> (Sets a property of the quest to the value of --value)
                    --unset-prop <key> (Removes a property from a quest)

                `.replace(/  +/g, ''))
                return
            }

            for(const quest of q.quests) {
                if(quest.key != "" && quest.key == args._.slice(1).join(" ") && quest.completedAt == "") {
                    let old_version = { ...quest }
                    if(args.setProp != undefined && args.setProp == "") return console.error("Can't set empty key.");

                    if(args.newProject == true) args.newProject = "";
                    if(args.newKey == true) args.newKey = "";
                    if(args.newState == true) args.newState = "";
                    if(args.newText == true) args.newText = "";
                    if(args.appendText == true) args.appendText = "";
                    if(args.prependText == true) args.prependText = "";
                    if(args.replaceText == true) args.replaceText = "";

                    if(args.newProject != undefined) quest.project = args.newProject;
                    if(args.newKey != undefined) quest.key = args.newKey;
                    if(args.newExp) quest.exp = parseInt(args.newExp);
                    if(args.newPriority) quest.priority = parseInt(args.newPriority);
                    if(args.newState != undefined) quest.state = args.newState.toUpperCase();
                    if(args.newText) quest.text = args.newText;
                    if(args.appendText) quest.text = `${quest.text} ${args.appendText}`;
                    if(args.prependText) quest.text = `${args.prependText} ${quest.text}`;
                    if(args.replaceText) quest.text = quest.text.replace(args.replaceText, args.replaceWith);
                    if(args.setProp) quest.properties[args.setProp] = `${args.value}`;
                    if(args.unsetProp) delete quest.properties[args.unsetProp];
                    await q.exportFile();
                    console.log(q.colourQuest(quest))
                    q.dispatchScriptHook("quest_modified", {"quest": quest, "old": old_version})
                    return
                }
            }

            quests = filterQuests(true);
            if(quests.length > 1 && !args.m) {
                for(const quest of quests) { console.log(q.colourQuest(quest)) }
                console.error("\nSearch too ambiguous, be more specific.")

            } else if(quests.length == 1){
                let old_version = { ...quests[0] }
                if(args.newState == true) args.newState = "";
                if(args.newKey == true) args.newKey = "";
                if(args.replaceWith == true) args.replaceWith = "";
                if(args.newProject == true) args.newProject = "";

                if(args.newProject != undefined) quests[0].project = args.newProject;
                if(args.newKey != undefined) quests[0].key = args.newKey;
                if(args.newExp) quests[0].exp = parseInt(args.newExp);
                if(args.newPriority) quests[0].priority = parseInt(args.newPriority);
                if(args.newState != undefined) quests[0].state = args.newState.toUpperCase();
                if(args.newText) quests[0].text = args.newText;
                if(args.appendText) quests[0].text = `${quests[0].text} ${args.appendText}`;
                if(args.prependText) quests[0].text = `${args.prependText} ${quests[0].text}`;
                if(args.replaceText) quests[0].text = quests[0].text.replace(args.replaceText, args.replaceWith);
                if(args.setProp) quests[0].properties[args.setProp] = args.v || args.value || "";
                if(args.unsetProp) delete quests[0].properties[args.unsetProp];
                await q.exportFile()
                console.log(q.colourQuest(quests[0]));
                q.dispatchScriptHook("quest_modified", {"quest": quests[0], "old": old_version})

            } else {
                console.log("No results found.")
            }

            break;

        case "done":
        case "complete":
        case "c":
        case "d":
            if(args.h) {
                console.log(`done
                Input:
                    text (used to search text of quests)
                    if text matches a quests key, shows only that match

                Args:
                    -a (show completed quests)
                    --project <name>
                    --key <name>
                    --tag <tag>
                    --exp <number>
                    --priority <number>
                    --state <name>

                `.replace(/  +/g, ''))
                return
            }

            function completeQuest(quest) {
                quest.completedAt = dayjs().format('HH:mm DD-MM-YYYY');

                if(args.f) {
                    //if(!quest.tags.includes("failed!")) quest.tags.push("failed!")
                    quest.state = "FAILED";
                    console.log("Quest Failed: "+q.colourQuest(quest));
                } else {
                    quest.state = "DONE";
                    console.log("Quest Completed: "+q.colourQuest(quest));
                    q.dispatchScriptHook("quest_completed", {"quest": quest})
                    q.gainEXP(quest.exp);
                }
            }

            for(const quest of q.quests) {
                if(quest.key == args._.slice(1).join(" ") && quest.completedAt == "") {
                    completeQuest(quest)
                    await q.exportFile();
                    return
                }
            }

            quests = filterQuests();
            if(quests.length > 1 && !args.m) {
                for(const quest of quests){
                    console.log(q.colourQuest(quest))
                }
                console.error("\nSearch too ambiguous, be more specific.")
            } else if(quests.length > 1 && args.m) {
                for(const quest of quests) {
                    completeQuest(quest)
                }
                await q.exportFile()
            } else if(quests.length == 1){

                completeQuest(quests[0])
                await q.exportFile()
            } else {
                console.log("No results found.")
            }

            break;

        case "show":
        case "get":
        case "search":
        case "s":
        case "g":
            if(args.h) {
                console.log(`get
                Input:
                    text (used to search text of quests)
                    if text matches a quests key, shows only that match

                Args:
                    -a (show completed quests)
                    --project <name>
                    --key <name>
                    --tag <tag>
                    --exp <number>
                    --priority <number>
                    --state <name>

                `.replace(/  +/g, ''))
                return
            }

            for(const quest of q.quests) {
                if(quest.key == args._.slice(1).join(" ")) {
                    console.log(q.colourQuest(quest));
                    return
                }
            }

            for(const quest of filterQuests(args.a || false)){
                console.log(q.colourQuest(quest))
            }



            break;


        case "archive":
        case "clean":
        case "cleanup":
            let completedQuests = q.quests.filter(function(el) { return el.completedAt != ""; });
            q.quests = q.quests.filter(function(el) { return el.completedAt == ""; });

            let archives = new Questing();
            await archives.loadFile(q.questArchive);
            archives.quests = archives.quests.concat(completedQuests);
            await archives.exportFile(q.questArchive);
            await q.exportFile()
            q.dispatchScriptHook("quests_archived", {"quests": completedQuests})
            console.log(`Archived ${completedQuests.length} quests.`)
            break;

        case "delete":
            if(args.h) {
                console.log(`delete
                Input:
                    text (used to search text of quests)

                Args:
                    -a (show completed quests)
                    --project <name>
                    --key <name>
                    --tag <tag>
                    --exp <number>
                    --priority <number>

                `.replace(/  +/g, ''))
                return
            }

            for(const quest of q.quests) {
                if(quest.key == args._.slice(1).join(" ")) {
                    q.quests = q.quests.filter(function(el) { return el != quest; });
                    console.log(q.colourQuest(quest))
                    q.dispatchScriptHook("quest_deleted", {"quest": quest})
                    await q.exportFile()
                    return
                }
            }

            quests = filterQuests(true);
            if(quests.length > 1 && !args.m) {
                for(const quest of quests){
                    console.log(q.colourQuest(quest))
                }
                console.error("\nSearch too ambiguous, be more specific.")
            } else if(quests.length > 1 && args.m) {
                for(const quest of quests) {
                    console.log(q.colourQuest(quest))
                    q.quests = q.quests.filter(function(el) { return el != quest; });
                    q.dispatchScriptHook("quest_deleted", {"quest": quest})
                }
                await q.exportFile()
            } else {
                console.log(q.colourQuest(quests[0]))
                q.quests = q.quests.filter(function(el) { return el != quests[0]; });
                q.dispatchScriptHook("quest_deleted", {"quest": quests[0]})
                await q.exportFile()
            }

            break;

        case "edit":
            if(args.h) {
                console.log(`edit

                Args:
                    --e <editor> (override editor command)

                `.replace(/  +/g, ''))
                return
            }
            if(args.editor) q.settings.editor = args.editor;
            await q.editFile();
            break;

        case "list":
        case "ls":
        case "a":
            if(args.h) {
                console.log(`ls
                Input:
                    text (used to search text of quests)

                Args:
                    -a (show completed quests)
                    --project <name>
                    --key <name>
                    --tag <tag>
                    --exp <number>
                    --priority <number>

                `.replace(/  +/g, ''))
                return
            }
            for(const quest of filterQuests(args.a || false)) {
                console.log(q.colourQuest(quest))
            }
            break;

        case "add":
        case "a":
            if(args.h) {
                console.log(`add

                Example:
                    * 22:55 04-07-2025: Finish this quest system. #coding @quest [500] (100) $q1
                    - Line starts with "*"
                    - Optionally start the text with "HH:mm DD-MM-YYYY: " to mark quest as completed
                    - contains text
                    - Optionally any number of tags marked #tag1 #tag2 #etc
                    - Optionally assign a project with @projectName
                    - Optionally assign a key with $keyName
                    - Optionally assign EXP reward for completion with [exp number]
                    - Optionally assign priority with (priority number)
                `.replace(/  +/g, ''))
                return
            }
            let t = args._.slice(1).join(" ");
            if(t) {
                let nq = q.parseQuestLine(t)
                await q.exportFile();
                console.log(q.colourQuest(nq))
            }

            break;

        case "import":
            let load_file = args.f || null; //define what file to import
            if(load_file == null) {console.log("No import file specified. (-f <file>)") } else {
                await q.loadFile(load_file) //Add the new file
                await q.exportFile() //Save all to main
            }

            break;

        default:
            console.log(`Unknown input.`);
    }
}
