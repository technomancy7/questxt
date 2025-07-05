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
        this.quests = []
        this.settings = {}

        this.priorityRe = /\(\d+\)/g; // Matches (number)
        this.expRe = /\[\d+\]/g; // Matches [number]
        this.keyRe = /\$[a-zA-Z0-9]+/g;
        this.tagsRe = /\#[a-zA-Z0-9]+/g;
        this.projectRe = /\@[a-zA-Z0-9]+/g;
    }

    colour(c) {
        if(this.settings.disableColours) return "";
        if(this.settings.disableColour) return "";
        if(this.settings.disableColors) return "";
        if(this.settings.disableColor) return "";
        let fmtCodes = {
            "reset": '\033[0m',
            "red": Bun.color("red", "ansi"),
            "green": Bun.color("green", "ansi"),
            "blue": Bun.color("blue", "ansi"),
            "cyan":Bun.color("cyan", "ansi"),
            "orange":Bun.color("orange", "ansi"),
            "yellow": Bun.color("yellow", "ansi"),
            "bold": "\u001b[1m",
            "dim": "\u001b[2m",
            "italic": "\u001b[3m",
            "underline": "\u001b[4m",
            "blink": "\u001b[5m",
            "reverse": "\u001b[7m",
            "hidden": "\u001b[8m",
            "strike_through": "\u001b[9m",
        }

        let f = fmtCodes[c];
        if(f == undefined) return "";
        return f;
    }

    gainEXP(gained) {
        if(gained <= 0) return;

        let exp = this.settings.exp;
        let level = this.settings.level;
        let expToLevel = Math.floor(100 * level * 1.2);

        exp = exp + gained;

        if(this.settings.silenceEXPGain != true) console.log(this.colour("green")+`Gained ${gained} EXP. (Lvl. ${level}, ${exp}/${expToLevel})${this.colour("reset")}`)

        if(exp >= expToLevel) {
            exp = exp - expToLevel;
            level = level + 1;

            if(this.settings.silenceLevelUp != true) console.log(this.colour("orange")+`Level up! Now level ${level}${this.colour("reset")}`)
        }
        this.settings.exp = exp;
        this.settings.level = level;
    }

    resetState() {
        this.quests = {};
        this.settings = {};
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
            key: ""
        }
    }

    parseQuestLine(text) {
        let quest = this.defaultQuest();



        function startsWithDateTime(text) {
            const regex = /^\d{2}:\d{2} \d{2}-\d{2}-\d{4}: /;
            return regex.test(text);
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

        quest.text = text
            .replace(this.priorityRe, '')
            .replace(this.expRe, '')
            .replace(this.keyRe, '')
            .replace(this.tagsRe, '')
            .replace(this.projectRe, '')
            .trim();
        this.quests.push(quest);
        return quest;
    }

    parseSetting(line) {
        let key = line.split(" ")[0];
        let value = line.split(" ").slice(1).join(" ");

        if(value == "") value = true;
        else if(value == "false") value = false;
        else if(key.includes(":")) {
            const nuType = key.split(":")[1]
            key = key.split(":")[0]
            if(nuType == "int") value = parseInt(value)
            if(nuType == "list") value = value.split("|")
        }

        this.settings[key] = value;
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
                } else if(line.startsWith("* ")) {
                    if(line.slice(2) != "") this.parseQuestLine(line.slice(2))
                }

            }
        }
    }

    formatQuest(q) {
        let ln = q.text;
        if(q.completedAt) ln = `${q.completedAt}: ${ln}`;
        if(q.key != "") ln = ln + ` $${q.key}`;
        if(q.project != "") ln = ln + ` @${q.project}`;
        if(q.priority != 0) ln = ln + ` (${q.priority})`;
        if(q.exp != 0) ln = ln + ` [${q.exp}]`;
        if(q.tags.length > 0) ln = ln + ` ${q.tags.map(word => `#${word}`).join(' ')}`;

        ln = `* ${ln}`
        return ln;
    }


    colourQuest(q) {
        return this.colourQuestLine(this.formatQuest(q))
    }
    colourQuestLine(ql) {

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
            ql = ql.replace(tag, `${this.colour('blue')}${tag}${this.colour('reset')}`)
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
                if(typeof val == "string") text.push(`@settings.${key} ${val}`.trim())
                if(typeof val == "number") text.push(`@settings.${key}:int ${val}`.trim())
                if(typeof val == "boolean" && val == true) text.push(`@settings.${key}`.trim())
                if(typeof val == "boolean" && val == false) text.push(`@settings.${key} false`.trim())
                if(typeof val == "object" && Array.isArray(val)) text.push(`@settings.${key}:list ${val.join("|")}`.trim())
            }
        }

        text.push("---")
        for (const q of questsObj) {
            text.push(this.formatQuest(q))
        }

        await Bun.write(path, text.join("\n").trim()); //console.log(text.join("\n"))
    }
}

if(import.meta.main) {
    let q = new Questing();
    await q.loadFile();
    const args = argParser(process.argv.slice(2));
    let quests = [];

    function filterQuests(includeCompleted = false) {
        let output = []
        for(const quest of q.quests) {
            let accepted = false;
            let denied = false;

            if(!includeCompleted && quest.completedAt != "") continue;

            //if(args.key && quest.key == args.key) accepted = true;
            if(args.key && quest.key != args.key) denied = true;
            if(args.exp && quest.exp != parseInt(args.exp)) denied = true;
            if(args.priority && quest.priority != parseInt(args.priority)) denied = true;
            //if(args.project && quest.project == args.project) accepted = true;
            if(args.project && quest.project != args.project) denied = true;
            //if(args.t && quest.tags.includes(args.t)) accepted = true;
            if(args.t && !quest.tags.includes(args.t)) denied = true;
            //if(args._.slice(1).length > 0 && quest.text.includes(args._.slice(1).join(" "))) accepted = true;
            if(args._.slice(1).length > 0 && !quest.text.includes(args._.slice(1).join(" "))) denied = true;

            //console.log(quest, accepted, denied)
            //if(accepted && !denied) output.push(quest)
            if(!denied) output.push(quest)

        }
        return output;
    }

    function printSettings() {
        for(const [k, v] of Object.entries(q.settings)) {
            console.log(`${typeof v} ${q.colour('orange')}${k}${q.colour('reset')}\t\t${q.colour('orange')}${v}${q.colour('reset')}`)
        }
    }
    switch (args._[0]) {
        case "unset":
            delete q.settings[args._.slice(1).join(" ")];
            await q.exportFile()
            printSettings()
            break;

        case "set":
            let new_setting = args._.slice(1).join(" ");
            q.parseSetting(new_setting);
            await q.exportFile()
            printSettings()
            break;

        case "settings":
            printSettings()
            break

        case "gainexp":
            q.gainEXP(parseInt(args._[1]))
            q.exportFile()
            break;

        case "status":
            let expToLevel = Math.floor(100 * q.settings.level * 1.2);
            console.log(`Level ${q.settings.level}, ${q.settings.exp}/${q.settings.exp}`)
            break;

        case "sort":
            q.sortEntriesByPriority(args.r || false);
            await q.exportFile();
            break;

        case "done":
        case "complete":
        case "c":
        case "d":
            quests = filterQuests();
            if(quests.length > 1 && !args.m) {
                for(const quest of quests){
                    console.log(q.colourQuest(quest))
                }
                console.error("\nSearch too ambiguous, be more specific.")
            } else if(quests.length > 1 && args.m) {
                for(const quest of quests) {
                    quest.completedAt = dayjs().format('HH:mm DD-MM-YYYY')
                    console.log(q.colourQuest(quest))
                    q.gainEXP(quest.exp)
                }
                await q.exportFile()
            } else {

                quests[0].completedAt = dayjs().format('HH:mm DD-MM-YYYY')
                console.log(q.colourQuest(quests[0]))
                q.gainEXP(quests[0].exp)
                await q.exportFile()
            }

            break;

        case "show":
        case "get":
        case "search":
        case "s":
        case "g":
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

            console.log(`Archived ${completedQuests.length} quests.`)
            break;

        case "delete":
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
                }
                await q.exportFile()
            } else {
                console.log(q.colourQuest(quests[0]))
                q.quests = q.quests.filter(function(el) { return el != quests[0]; });
                await q.exportFile()
            }

            break;

        case "edit":
            if(args.e) q.settings.editor = args.e;
            await q.editFile();
            break;

        case "list":
        case "ls":
            for(const quest of filterQuests(args.a || false)) {
                console.log(q.colourQuest(quest))
            }
            break;

        case "add":
        case "a":
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
