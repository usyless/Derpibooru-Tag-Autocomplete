# Derpibooru Tag Autocomplete
Altertnative tag autocompletion for derpibooru.org, with infinite scroll, using the available API or using a local list of tags

## Use Instructions
- No setup required, just install the extension.
- Navigate the autofill column with the arrows keys, or mouse scroll.
- Press `tab` to fill the currently selected item, by default this will fill the first item.
- Currently supported search operators (will not interfere with search):
  - `,`, `AND`, `&&`, `OR`, `||`, `-`, `!`, `NOT`, `()`

## Settings
- You can change the match mode from any match in the search to just matching the start of the tags
- If you enable the local autocomplete you need to make sure to provide a valid tags file
- The tags file is a csv of format `{tag name},{tag count},"{tag aliases separated by commas inside quotes}"`

## Install
### Firefox Desktop/Mobile (or Fennec)
- Install extension through the [Mozilla addons page ](https://addons.mozilla.org/en-GB/firefox/addon/derpibooru-tag-autocomplete/)
### Chrome or other chromium based browsers
- Download chromium zip from the [latest release](https://github.com/usyless/Derpibooru-Tag-Autocomplete/releases/latest)
- Unzip the file into a known directory
- Visit chrome://extensions in your browser
- Enable developer mode (There should be a toggle present on the page)
- Press "Load Unpacked" or equivalent, select the unzipped folder

## Extension Images
### Desktop
![Derpibooru Tag Autocomplete a desktop](https://github.com/usyless/Derpibooru-Tag-Autocomplete/blob/main/assets/desktop.png?raw=true)
### Mobile
![Derpibooru Tag Autocomplete mobile](https://github.com/usyless/Derpibooru-Tag-Autocomplete/blob/main/assets/mobile.png?raw=true)

### Compiling
- Use emscripten
- `emcc autocomplete.cpp -O3 -sEXPORTED_FUNCTIONS=_loadTags,_complete,_delete_return_string,_free,_malloc -sSTANDALONE_WASM -sINITIAL_HEAP=104857600 --no-entry -o standalone.wasm`
