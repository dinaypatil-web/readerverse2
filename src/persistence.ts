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
    const tx = db.transaction(STORE_BOOKS, 'readwrite');
    const store = tx.objectStore(STORE_BOOKS);
    const req = store.get(bookId);
    req.onsuccess = () => {
        const book = req.result;
        if (book) {
            let bookToUpdate = book;
            if (book.fileData) {
                bookToUpdate = { ...book, fileData: safeCloneArrayBuffer(book.fileData) };
            }
            bookToUpdate.lastIndex = index;
            if (extraState) Object.assign(bookToUpdate, extraState);
            store.put(bookToUpdate);
        }
    };
};

export const saveBookToDB = async (book: Book) => {
    let bookToSave = book;
    if (book.fileData) {
        bookToSave = { ...book, fileData: safeCloneArrayBuffer(book.fileData) };
    }
    const db = await initDB();
    const tx = db.transaction(STORE_BOOKS, 'readwrite');
    tx.objectStore(STORE_BOOKS).put(bookToSave);
};

export const getBooks = async (): Promise<Book[]> => {
    try {
        const db = await initDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_BOOKS, 'readonly');
            const req = tx.objectStore(STORE_BOOKS).getAll();
            req.onsuccess = () => {
                const books = req.result.map((b: any) => ({
                    ...b,
                    bookmarks: b.bookmarks || [],
                    ...(b.fileData && { fileData: safeCloneArrayBuffer(b.fileData) })
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
    db.transaction(STORE_BOOKS, 'readwrite').objectStore(STORE_BOOKS).delete(id);
};
