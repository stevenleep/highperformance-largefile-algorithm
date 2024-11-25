/**
 * @author: Steven Lee
 * @description: 此文件演示了一种在浏览器环境中高性能的进行文件分片上传和下载，以及文件合成的方法。
 *               通过 IndexedDB 和 FileSystem API 的有机结合, 可将内存占用控制在合理范围内。
 * 
 * @notes:       在生产环境中可配合 Web Worker、可转移对象、Wasm等技术，进一步提升性能。
 *               - https://developer.mozilla.org/zh-CN/docs/Web/API/Web_Workers_API/Transferable_objects 关于可转移对象(比如： ArrayBuffer是将原来的关联内存转移到另外的缓冲区)
 *              - https://developer.mozilla.org/zh-CN/docs/WebAssembly，WebAssembly 生成机器码、绕过 JIT 编译、手动GC机制（我们依赖Golang的GC），性能更好。
 */

const options = {
  chunkSize: 1024 * 1024 * 10, // 10MB
};

document.addEventListener("DOMContentLoaded", () => {
  
  onUploadFile((file) => {
    const metaFile = getMetaFile(file);

    /**
     * 浏览器提供的 IndexedDB API 可以用来存储任何大量的结构化数据，这其中包括File和 Blob、Buffer等。
     * 并且这些数据写入到磁盘上数据库中而非内存。
     * ref:
     *  IndexedDB API - https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API   
     *  结构化克隆算法(Structured Clone Algorithm) - https://developer.mozilla.org/zh-CN/docs/Web/API/Window/structuredClone
     */
    const request = indexedDB.open("file-upload", 1);
    let db: IDBDatabase;
    request.onupgradeneeded = () => {
      db = request.result;
      db.createObjectStore("chunks");
    };

    request.onsuccess = () => {
      db = request.result;
      let index = 0;
      function writeChunk() {
        if (index <= metaFile.chunkRanges.length - 1) {
          const chunkRange = metaFile.chunkRanges[index];
          let chunk: any = file.slice(chunkRange.start, chunkRange.end);
          writeToDB(
            chunk,
            db,
            chunkRange,
            () => {
              index++;
              writeChunk();
            },
            () => {
              chunk = null;
            }
          );
        } else {
          db.close();
        }
      }
      writeChunk();
    };
  });




  // 模拟分片文件合成和下载
  const downloadBtn = document.querySelector<HTMLButtonElement>("#download")!;
  downloadBtn.addEventListener("click", async () => {
    const readableDB = indexedDB.open("file-upload", 1);
    let db: any;

    readableDB.onupgradeneeded = () => {
      db = readableDB.result;
      db.createObjectStore("chunks");
    };

    readableDB.onsuccess = async () => {
      db = readableDB.result;
      const transaction = db?.transaction("chunks", "readonly");
      const store = transaction.objectStore("chunks");

      /**
       * https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/openCursor
       * The openCursor() method of the IDBObjectStore interface returns an IDBRequest object, and, in a separate thread, returns a new IDBCursorWithValue object.
       * Used for iterating through an object store with a cursor.
       *
       * 特点：
       *  1. IDBRequest object，返回一个新的 IDBCursorWithValue object
       *  2. 在一个独立的线程中运行
       *  3. 用于迭代具有游标的对象存储 - 可迭代的对象存储
       */
      const request = store.openCursor();

      // FIXME: IndexedDB 的 cursor 第一次连接时相对慢一点，基准测试平均时间在 300ms-500ms 左右, 目前暂不造成性能瓶颈。 
      request.onsuccess = async () => {
        const cursor = request.result;

        if (cursor) {
          const arrayBuffer = cursor.value;

          /**
           * 这就是我们需要的分片的 ArrayBuffer 数据
           *
           * 你可以借助 FileSystem API 或者 Blob API 将 ArrayBuffer 转换为文件
           * eg: 可读写的文件 https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle#synchronously_reading_and_writing_a_file
           */
          console.log(cursor, arrayBuffer);

          // 方式一: FileSystemWritableFileStream API 写入文件
          // ref: https://developer.mozilla.org/en-US/docs/Web/API/FileSystemWritableFileStream
          // const fileHandle = await window.showSaveFilePicker();
          // const writable = await fileHandle.createWritable();
          // await writable.write(arrayBuffer);
          // await writable.close();

          // 方式二：FileSystemSyncAccessHandle https://developer.mozilla.org/en-US/docs/Web/API/FileSystemSyncAccessHandle#examples
          // Get handle to draft file
          // const root = await navigator.storage.getDirectory();
          // const draftHandle = await root.getFileHandle("draft.txt", { create: true });
          // // Get sync access handle
          // const accessHandle = await draftHandle.createSyncAccessHandle();
          // const writeBuffer = accessHandle.write(arrayBuffer, { at: arrayBuffer.byteLength });
          // // Persist changes to disk.
          // accessHandle.flush();
          // // Always close FileSystemSyncAccessHandle if done.
          // accessHandle.close();

          /**
           * 下一个游标
           */
          cursor.continue();
        } else {
          db.close();
        }
      };
    };
  });
});




/**
 * ---------------------------------------- 工具函数 开始 ----------------------------------------
 */

/**
 * 高性能的将数据分片写入IndexedDB
 *  - 内存占用率：当前 chunk 的大小 + 读取文件的 ArrayBuffer 的大小
 *  - 比如：10MB 的 chunkSize，读取 10MB 的 ArrayBuffer，内存占用 20MB
 */
function writeToDB(chunk, db, chunkRange, onSuccess, onCleanUpChunk) {
  let reader: any = new FileReader();
  reader.onload = async () => {
    // 即时释放内存
    URL.revokeObjectURL(reader.result as string);
    let arrayBuffer: any = reader.result as ArrayBuffer;
    await writeArrayBufferToIndexedDB(db, "chunks", chunkRange.id, arrayBuffer);
    arrayBuffer = null;
    reader = null;

    onCleanUpChunk && onCleanUpChunk();
    requestAnimationFrame(() => {
      onSuccess();
    });
  };

  reader.readAsArrayBuffer(chunk);
}

// 模拟点击
function onUploadFile(callback: (file: File) => void) {
  const fakeUploadBtn =
    document.querySelector<HTMLDivElement>(".fake-upload-btn")!;
  const realUploadInput = document.querySelector<HTMLInputElement>("#file")!;

  fakeUploadBtn.addEventListener("click", () => {
    realUploadInput.click();
  });

  realUploadInput.addEventListener("change", () => {
    const file = realUploadInput.files![0];
    callback(file);

    // 清空
    realUploadInput.value = "";
  });
}

// 文件分片信息
function getMetaFile(file: File) {
  const { name, size, type, webkitRelativePath, lastModified } = file;
  const totalChunks = Math.ceil(size / options.chunkSize);
  const chunkRanges = Array.from({ length: totalChunks }, (_, index) => {
    const start = index * options.chunkSize;
    const end = Math.min(start + options.chunkSize, size);
    const chunkSize = end - start;
    const isLastChunk = index === totalChunks - 1;
    const id = `${webkitRelativePath}${name}-${Date.now()}-${index}`;
    return {
      start,
      end,
      chunkSize,
      index,
      isLastChunk,
      id,
      timestamp: Date.now(),
    };
  });

  return {
    name,
    size,
    type,
    totalChunks,
    chunkRanges,
    webkitRelativePath,
    lastModified,
    timestamp: Date.now(),
  };
}

// 写入文件到ArrayBuffer到IndexedDB
function writeArrayBufferToIndexedDB(
  db: IDBDatabase,
  storeName: string,
  id: string,
  arrayBuffer: ArrayBuffer
) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);

    /**
     * 动态存储二进制数据
     */
    const request = store.put(arrayBuffer, id);

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * @title 从IndexedDB读取ArrayBuffer
 * @deprecated 废弃 - 改使用 openCursor 迭代
 */
function readArrayBufferFromIndexedDB(
  db: IDBDatabase,
  storeName: string,
  id: string
) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// 逐步追加ArrayBuffer到Stream
function appendArrayBufferToStream(stream: any, arrayBuffer: ArrayBuffer) {
  return new Promise((resolve, reject) => {
    stream.write(arrayBuffer).then(() => {
      resolve(undefined);
    });
  });
}

/**
 * ---------------------------------------- 工具函数 结束 ----------------------------------------
 */
