//An example hook

export function loaded(q) {
    //console.log("Trash hook loaded.")
}

export async function quest_deleted(q, data) {
    let trash_file = Bun.file(`${Bun.env.HOME}/.quests/trash.json`);
    const exists = await trash_file.exists();
    let trash_data = [];
    let text = await trash_file.text()
    if(exists) { trash_data = JSON.parse(text); }
    trash_data.push(data.quest);
    Bun.write(trash_file, JSON.stringify(trash_data))
}
