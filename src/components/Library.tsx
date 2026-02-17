import React from 'react';
import { BookOpen, Trash2, Plus, Bookmark } from 'lucide-react';
import { Book } from '../types';

interface LibraryProps {
    books: Book[];
    onOpenBook: (b: Book) => void;
    onDeleteBook: (id: string) => void;
    onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const Library: React.FC<LibraryProps> = ({ books, onOpenBook, onDeleteBook, onImport }) => {
    return (
        <div className="h-full overflow-y-auto p-10 no-scrollbar">
            {/* Hero Section */}
            <div className="text-center mb-12">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-600/20">
                    <BookOpen size={36} className="text-white" />
                </div>
                <h1 className="text-3xl font-black tracking-tight mb-2">ReaderVerse <span className="text-blue-600">2</span></h1>
                <p className="text-[11px] font-bold opacity-30 uppercase tracking-[0.3em]">Premium Neural eBook Reader</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 pb-32">
                {/* Import Card */}
                <label className="p-8 rounded-[3.5rem] border-2 border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-500/5 cursor-pointer hover:border-blue-600 hover:bg-blue-600/5 transition-all flex flex-col items-center justify-center gap-4 min-h-[200px] group">
                    <div className="w-14 h-14 bg-blue-600/10 text-blue-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-all">
                        <Plus size={28} />
                    </div>
                    <span className="text-[11px] font-black uppercase tracking-widest opacity-40 group-hover:opacity-80 transition-all">Import Book</span>
                    <span className="text-[9px] font-bold opacity-20 uppercase tracking-widest">EPUB · PDF · DOCX · TXT · MOBI</span>
                    <input type="file" className="hidden" accept=".epub,.pdf,.txt,.docx,.mobi" onChange={onImport} />
                </label>

                {/* Book Cards */}
                {books.map(b => (
                    <div key={b.id} onClick={() => onOpenBook(b)}
                        className="p-8 rounded-[3.5rem] border bg-white dark:bg-zinc-900 dark:border-zinc-800 shadow-xl active:scale-95 transition-all group cursor-pointer hover:shadow-2xl hover:-translate-y-1">
                        <div className="flex justify-between mb-8">
                            <div className="w-14 h-14 bg-gradient-to-br from-blue-600/10 to-indigo-600/10 text-blue-600 rounded-2xl flex items-center justify-center">
                                <BookOpen size={28} />
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); onDeleteBook(b.id); }}
                                className="opacity-0 group-hover:opacity-40 p-3 hover:text-red-500 transition-all">
                                <Trash2 size={20} />
                            </button>
                        </div>
                        <h3 className="text-xl font-black mb-2 line-clamp-2">{b.title}</h3>
                        <p className="text-[10px] font-bold opacity-20 mb-4 line-clamp-1">{b.author}</p>
                        <div className="flex justify-between items-center">
                            <p className="text-[10px] font-black opacity-30 uppercase tracking-widest">{b.type}</p>
                            <div className="flex items-center gap-3">
                                {b.lastIndex && b.lastIndex > 0 && (
                                    <div className="w-16 h-1.5 bg-zinc-500/10 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.min(100, ((b.lastIndex || 0) / Math.max(1, b.displayBlocks.reduce((s, bl) => s + bl.wordCount, 0))) * 100)}%` }} />
                                    </div>
                                )}
                                {b.bookmarks?.length > 0 && (
                                    <div className="flex items-center gap-1 opacity-40 text-[10px] font-black uppercase">
                                        <Bookmark size={10} fill="currentColor" /> {b.bookmarks.length}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                {books.length === 0 && (
                    <div className="col-span-full py-20 text-center flex flex-col items-center opacity-15">
                        <BookOpen size={64} className="mb-6 animate-float" />
                        <span className="uppercase font-black tracking-widest text-sm">Your Library is Empty</span>
                        <p className="text-xs opacity-60 mt-2">Import your first book to get started</p>
                    </div>
                )}
            </div>
        </div>
    );
};
