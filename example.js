//An example hook

export function loaded(q) {
    //console.log("Script hook Example was loaded.")
}
export function quest_added(q, data) {
    //console.log("A quest was added.");
    //console.log(data)
}
export function quest_completed(q, data) {}
export function quest_modified(q, data) {
    //console.log(data)
}
export function quest_deleted(q, data) {}
export function quests_archived(q, data) {}
export function exp_gained(q, data) {}
