const tagAmount = 25;

let ac_list;

(async () => {

    async function autocomplete(input) {
        let currentFocus = -1;
        let endReached = false, worker;

        function addToInput(tag, length) {
            if (input.value === "") {
                input.value = tag;
            } else {
                input.value = input.value.substring(0, input.value.length - length) + tag;
            }
        }

        function simplifyNumber(number) {
            if (number < 1000) return number.toString();
            else if (number < 1000000) return `${(number / 1000).toFixed(1)}K`;
            else return `${(number / 1000000).toFixed(1)}M`;
        }

        function createListItem(index, length, alias, full, count) {
            const list = document.createElement("li");
            list.setAttribute("ac-name", full);
            const outer_div = document.createElement("div");
            const text_div = document.createElement("div");
            text_div.classList.add("text-div");
            const number_div = document.createElement("div");
            number_div.classList.add("number-div");

            if (alias !== "") {
                boldMatch(text_div, index, length, alias);
                let arrow = document.createTextNode(` → ${full}`);
                text_div.appendChild(arrow);
            } else {
                boldMatch(text_div, index, length, full);
            }
            number_div.textContent = simplifyNumber(count);
            outer_div.appendChild(text_div);
            outer_div.appendChild(number_div);
            list.appendChild(outer_div);
            return list;
        }

        function boldMatch(div, index, length, text) {
            const strong = document.createElement('strong');
            if (index === 0) {
                strong.textContent = text.substring(0, length);
                const afterText = document.createTextNode(text.substring(length));
                div.appendChild(strong);
                div.appendChild(afterText);
            } else {
                const beforeText = document.createTextNode(text.substring(0, index));
                strong.textContent = text.substring(index, index + length);
                const afterText = document.createTextNode(text.substring(index + length));
                div.appendChild(beforeText);
                div.appendChild(strong);
                div.appendChild(afterText);
            }
        }

        async function setUp() {
            if (!worker) {
                worker = new Worker(browser.runtime.getURL("worker.js"));
                worker.postMessage([await getStoredData(), tagAmount]);
                worker.onmessage = displayAutocompleteResults;
            }
        }

        function displayAutocompleteResults(e) {
            const query = e.data[0];
            endReached = e.data[3];
            if (e.data[2]) {
                closeList();
                let lastScrollTop = 0;
                ac_list.addEventListener('scroll', () => {
                    if (ac_list.scrollTop < lastScrollTop) return;
                    lastScrollTop = ac_list.scrollTop <= 0 ? 0 : ac_list.scrollTop;
                    if (ac_list.scrollTop + ac_list.offsetHeight >= ac_list.scrollHeight) getResults(query);
                });
            }
            e.data[1].forEach(i => addItemToAutocomplete(query, i));
            if (e.data[2]) {
                if (ac_list.children.length > 0) {
                    ac_list.firstElementChild.classList.add("ac-active");
                    ac_list.style.maxHeight = `${6 * ac_list.firstElementChild.offsetHeight}px`;
                } else closeList();
            }
        }

        function addItemToAutocomplete(query, [index, alias, name, count]) {
            const ac_item = createListItem(index, query.length, alias, name, count);
            ac_item.addEventListener("click", (e) => {
                addToInput(getName(e.target), query.length);
                closeList();
                input.focus();
            });
            ac_list.appendChild(ac_item);
            return ac_item;
        }

        input.addEventListener("focus", setUp);

        input.addEventListener("input", () => {
            let query = input.value;

            let split = query.split(",");
            query = split[Math.max(0, split.length - 1)].trim();

            if (query.length <= 0) {
                closeList();
                return;
            }
            currentFocus = 0;
            getResults(query.toLowerCase());
        });

        function getResults(query) {
            if (worker) worker.postMessage([query]);
        }

        input.addEventListener("keydown", (e) => {
            const items = ac_list.getElementsByTagName("li");
            if (!items) return;
            if (e.keyCode === 40) { // down
                e.preventDefault();
                addActive(items, 1);
            } else if (e.keyCode === 38) { // up
                e.preventDefault();
                addActive(items, -1);
            } else if (e.keyCode === 9) { // tab
                e.preventDefault();
                if (currentFocus > -1) {
                    if (items) items[currentFocus].click();
                }
            }
        });

        function getName(elem) {
            while (!elem.getAttribute('ac-name')) elem = elem.parentElement;
            return elem.getAttribute('ac-name');
        }

        function addActive(items, effect) {
            let oldItem = items[currentFocus];
            oldItem.classList.remove("ac-active");
            currentFocus += effect;

            if (endReached && currentFocus >= items.length) currentFocus = 0;
            else if (currentFocus < 0) currentFocus = items.length - 1;
            let newItem = items[currentFocus];
            newItem.classList.add("ac-active");
            newItem.scrollIntoView({block: "center"});
        }

        function closeList(e) {
            if (!e || e.target !== input) {
                let newList = ac_list.cloneNode();
                ac_list.parentNode.replaceChild(newList, ac_list);
                ac_list = newList;
            }
        }

        document.addEventListener("click", (e) => closeList(e));
    }

    async function getStoredData() {
        let data = await browser.storage.local.get();
        data = data["derpibooru_csv"];
        if (!data) data = "";
        return data;
    }

    let form = document.querySelector("form");
    let div = document.createElement("div");
    div.classList.add("ac");
    form.before(div);
    div.appendChild(form);

    let input = document.getElementById("q");
    input.autocomplete = "off";

    ac_list = document.createElement("div");
    ac_list.id = "ac-list";
    ac_list.className = "ac-items";
    input.parentNode.parentNode.appendChild(ac_list);

    autocomplete(input);
})();