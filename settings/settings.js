let chrome_mode_forced = false;
if (typeof browser === "undefined") {
    var browser = chrome;
    chrome_mode_forced = true;
}

async function get_data() {
    let data = await browser.storage.local.get();
    let chrome_mode = data["chrome_mode"];
    if (!chrome_mode) chrome_mode = false;
    let file_name = data["file_name"];
    if (!file_name) file_name = "None, Download and choose a file to see autocomplete results";
    return [chrome_mode, file_name];
}

async function save_tags(file) {
    let reader = new FileReader();
    reader.addEventListener("load", async () => {
        const data = {};
        data["derpibooru_csv"] = reader.result;
        data["file_name"] = file.name;
        try {
            await chrome.storage.local.set(data);
            alert("Tags saved");
        } catch {
            alert("File size too big");
        }
        document.getElementById("current").innerText = `Current Loaded File: ${(await get_data())[1]}`;
    })
    reader.readAsText(file);
}

async function save_chrome_mode() {
    let data = {};
    data["chrome_mode"] = document.getElementById("chrome_mode").checked;
    await chrome.storage.local.set(data);
}

(async () => {
    const [chrome_mode, file_name] = await get_data();
    if (!chrome_mode_forced) {
        let chrome_mode_input = document.getElementById("chrome_mode");
        chrome_mode_input.checked = chrome_mode;
        chrome_mode_input.addEventListener("change", save_chrome_mode);
    }

    const current_tag_file = document.getElementById("current");
    current_tag_file.innerText = `Current Loaded File: ${file_name}`;

    const tag_input = document.getElementById("input");
    tag_input.addEventListener("change", e => save_tags(e.target.files[0]));
    document.getElementById("inputDiv").addEventListener("click", () => tag_input.click());

    document.getElementById("githubDiv").addEventListener("click", e => {
        const link = document.createElement('a');
        link.href = "https://github.com/usyless/Derpibooru-Tag-Autocomplete/tree/main/tags";
        link.target = "_blank";
        document.body.appendChild(link);
        link.click()
        document.body.removeChild(link);
    });
})();