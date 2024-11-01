let typeMap;

(async () => {
    'use strict';
    let wasmResult, instance, exports, memory;

    const importObject = {
        env: {
            memory: new WebAssembly.Memory({initial: 1600, maximum: 1600})
        }
    }

    const passStringToWasm = (str) => { // must free after
        const lengthBytes = (new TextEncoder()).encode(str);
        const bufferPointer = exports.malloc(lengthBytes.length + 1);
        memory.set(lengthBytes, bufferPointer);
        memory[bufferPointer + lengthBytes.length] = 0;
        return bufferPointer;
    }

     const readStringFromMemory = (ptr) => {
         let str = '';
         let byte = memory[ptr];
         const originalPtr = ptr;
         while (byte !== 0) {
             str += String.fromCharCode(byte);
             byte = memory[++ptr];
         }
         exports.delete_return_string(originalPtr);
         return str;
     }

    typeMap = {
        init: async (data) => {
            wasmResult = await WebAssembly.instantiateStreaming(await fetch(data.url), importObject);
            instance = wasmResult.instance;
            exports = instance.exports;
            exports._initialize(); // Emscripten required thing i think
            memory = new Uint8Array(exports.memory.buffer);

            const p = passStringToWasm(data.data);
            exports.loadTags(p, data.match_start ? 1 : 0);
            exports.free(p);
        },
        query: (data) => {
            const p = passStringToWasm(data.query);
            postMessage(JSON.parse(readStringFromMemory(exports.complete(p, data.newQuery ? 1 : 0))));
            exports.free(p);
        }
    }
})();

onmessage = (e) => typeMap?.[e.data.type]?.(e.data);
