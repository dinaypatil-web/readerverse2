import { Book } from './types';

// --- Utility ---
export const safeCloneArrayBuffer = (buffer: ArrayBuffer): ArrayBuffer => {
    if (buffer.byteLength === 0) return new ArrayBuffer(0);
    const newBuffer = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(newBuffer).set(new Uint8Array(buffer));
    return newBuffer;
};

// --- IndexedDB Persistence ---
const DB_NAME = 'ReaderVerse2_DB';
const STORE_BOOKS = 'books';

const initDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        try {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = (ev: any) => {
                const db = ev.target.result;
                if (!db.objectStoreNames.contains(STORE_BOOKS)) {
                    db.createObjectStore(STORE_BOOKS, { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        } catch (e) {
            reject(e);
        }
    });
};

export const updateBookProgress = async (bookId: string, index: number, extraState?: Partial<Book>) => {
    const db = await initDB();
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_BOOKS, 'readwrite');
        const store = tx.objectStore(STORE_BOOKS);
        const req = store.get(bookId);

        req.onsuccess = () => {
            const book = req.result;
            if (book) {
                // IMPORTANT: We do NOT need to clone the buffer here if we are just updating metadata.
                // Re-using the existing buffer is safe in IndexedDB and much faster.
                book.lastIndex = index;
                if (extraState) Object.assign(book, extraState);

                const putReq = store.put(book);
                putReq.onsuccess = () => resolve();
                putReq.onerror = () => reject(putReq.error);
            } else {
                resolve();
            }
        };
        req.onerror = () => reject(req.error);
    });
};

export const saveBookToDB = async (book: Book) => {
    const db = await initDB();
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_BOOKS, 'readwrite');
        const store = tx.objectStore(STORE_BOOKS);

        // Only clone if it's the first time saving to avoid issues with detached buffers
        let bookToSave = book;
        if (book.fileData) {
            bookToSave = { ...book, fileData: safeCloneArrayBuffer(book.fileData) };
        }

        const req = store.put(bookToSave);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};

export const getBooks = async (): Promise<Book[]> => {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_BOOKS, 'readonly');
            const store = tx.objectStore(STORE_BOOKS);
            const req = store.getAll();

            req.onsuccess = () => {
                const books = req.result.map((b: any) => ({
                    ...b,
                    bookmarks: b.bookmarks || [],
                    // We don't necessarily need to clone on read unless we plan to mutate it on UI
                    // but for safety with threads/workers, we keep it if it's a new instance.
                }));
                resolve(books);
            };
            req.onerror = () => resolve([]);
        });
    } catch (e) {
        return [];
    }
};

export const removeBookFromDB = async (id: string) => {
    const db = await initDB();
    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_BOOKS, 'readwrite');
        const req = tx.objectStore(STORE_BOOKS).delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
};
