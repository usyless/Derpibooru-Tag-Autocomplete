'use strict';

(() => {
    function autocomplete(input, ac_list) {
        let focus = -1, endReached = false, worker;
        const createListItem = listItemTemplate();

        function addToInput(tag, length) {
            input.value = input.value.substring(0, input.value.length - length) + tag;
        }

        function simplifyNumber(number) {
            if (number < 1000) return number.toString();
            else if (number < 1000000) return `${(number / 1000).toFixed(1)}K`;
            else return `${(number / 1000000).toFixed(1)}M`;
        }

        function listItemTemplate() {
            const list = document.createElement("li"),
                outer_div = document.createElement("div"),
                text_div = document.createElement("div"),
                number_div = document.createElement("div");
            text_div.classList.add("text-div");
            number_div.classList.add("number-div");
            outer_div.append(text_div, number_div);
            list.appendChild(outer_div);

            return (beforeText, bold, afterText, isAlias, name, count) => {
                number_div.innerText = simplifyNumber(count);
                const newList = list.cloneNode(true),
                    new_text_div = newList.firstChild.firstChild,
                    strong = document.createElement('strong');
                strong.innerText = bold;
                new_text_div.append(document.createTextNode(beforeText), strong, document.createTextNode(afterText));
                if (isAlias) new_text_div.appendChild(document.createTextNode(` → ${name}`));
                return newList;
            }
        }

        function displayAutocompleteResults(e) {
            const query = e.data[0], firstResult = e.data[2];
            endReached = e.data[3];
            if (firstResult) closeList();
            for (const i of e.data[1]) addItemToAutocomplete(query.length, i);
            if (firstResult) {
                if (ac_list.children.length > 0) ac_list.firstElementChild.classList.add("ac-active");
                else closeList();
            }
        }

        function addItemToAutocomplete(queryLength, [beforeText, bold, afterText, isAlias, name, count]) {
            const ac_item = createListItem(beforeText, bold, afterText, isAlias, name, count);
            ac_item.addEventListener('click', (e) => {
                e.stopPropagation();
                addToInput(name, queryLength);
                closeList();
                input.focus();
            });
            ac_list.appendChild(ac_item);
        }

        input.addEventListener("focus", async () => {
            worker = new Worker(browser.runtime.getURL("worker.js"));
            worker.postMessage([1, await getTagsCSV()]);
            worker.onmessage = displayAutocompleteResults;
        }, {once: true});

        input.addEventListener("input", () => {
            let query = input.value;

            const split = query.split(",");
            query = split[Math.max(0, split.length - 1)].trim();

            if (query.length <= 0) {
                closeList();
                return;
            }
            focus = 0;
            getResults(query.toLowerCase());
        });

        function getResults(query) {
            if (worker) worker.postMessage([0, query]);
        }

        input.addEventListener("keydown", (e) => {
            const items = ac_list.children;
            if (e.keyCode === 40) { // down
                e.preventDefault();
                changeActive(items, 1);
            } else if (e.keyCode === 38) { // up
                e.preventDefault();
                changeActive(items, -1);
            } else if (e.keyCode === 9) { // tab
                e.preventDefault();
                if (focus > -1) {
                    if (items) items[focus].click();
                }
            }
        });

        function changeActive(items, effect) {
            const oldItem = items[focus];
            oldItem.classList.remove("ac-active");
            focus += effect;

            if (endReached && focus >= items.length) focus = 0;
            else if (focus < 0) focus = items.length - 1;
            const newItem = items[focus];
            newItem.classList.add("ac-active");
            newItem.scrollIntoView({block: "center"});
        }

        function closeList() {
            const newList = ac_list.cloneNode();
            ac_list.parentNode.replaceChild(newList, ac_list);
            ac_list = newList;
            { // scroll stuff
                let lastScrollTop = 0;
                ac_list.addEventListener('scroll', () => {
                    if (ac_list.scrollTop < lastScrollTop) return;
                    lastScrollTop = ac_list.scrollTop <= 0 ? 0 : ac_list.scrollTop;
                    if (!endReached && ac_list.scrollTop + ac_list.offsetHeight >= ac_list.scrollHeight - 648) getResults();
                });
            }
        }

        document.addEventListener("click", closeList);
    }

    async function getTagsCSV() {
        let data = await browser.storage.local.get();
        data = data["derpibooru_csv"];
        if (!data) data = "";
        return data;
    }

    const form = document.querySelector("form"),
        div = document.createElement("div");
    div.classList.add("ac", ...form.classList);
    form.before(div);
    div.appendChild(form);

    const input = document.getElementById("q");
    input.autocomplete = "off";

    const ac_list = document.createElement("div");
    ac_list.id = "ac-list";
    ac_list.classList.add("ac-items");
    input.parentNode.parentNode.appendChild(ac_list);

    autocomplete(input, ac_list);
})();