import React from 'react';
import { X, Trash } from 'lucide-react';
import { Book, ChapterEntry, UserBookmark } from '../types';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
    activeBook: Book | null;
    currentChapter: ChapterEntry | null;
    jumpTo: (idx: number) => void;
    deleteBookmark: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
    isOpen, onClose, activeBook, currentChapter, jumpTo, deleteBookmark
}) => {
    const [tab, setTab] = React.useState<'chapters' | 'bookmarks'>('chapters');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex animate-fade-in">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-md" onClick={onClose} />
            <div className="relative w-[85%] max-w-sm h-full flex flex-col shadow-2xl animate-slide-left glass">
                <div className="p-10 border-b border-zinc-500/5 flex justify-between items-center">
                    <div className="flex gap-4">
                        <button onClick={() => setTab('chapters')}
                            className={`text-[11px] font-black uppercase tracking-widest transition-all ${tab === 'chapters' ? 'text-blue-600 scale-110' : 'opacity-30'}`}>
                            Chapters
                        </button>
                        <button onClick={() => setTab('bookmarks')}
                            className={`text-[11px] font-black uppercase tracking-widest transition-all ${tab === 'bookmarks' ? 'text-blue-600 scale-110' : 'opacity-30'}`}>
                            Bookmarks
                        </button>
                    </div>
                    <button onClick={onClose} className="p-3 bg-zinc-500/5 rounded-full"><X size={20} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-3 no-scrollbar">
                    {tab === 'chapters' ? (
                        activeBook?.chapters.map((c, i) => (
                            <button key={i} onClick={() => { jumpTo(c.startIndex); onClose(); }}
                                className={`w-full text-left p-6 rounded-[2.5rem] text-[11px] font-bold transition-all ${currentChapter === c ? 'bg-blue-600 text-white shadow-xl scale-[1.02]' : 'opacity-40 bg-zinc-500/5 hover:opacity-100'}`}>
                                {c.title}
                            </button>
                        ))
                    ) : (
                        <>
                            {(!activeBook?.bookmarks || activeBook.bookmarks.length === 0) && (
                                <div className="py-20 text-center opacity-20 uppercase font-black tracking-widest text-[10px]">No Bookmarks</div>
                            )}
                            {activeBook?.bookmarks?.sort((a, b) => b.timestamp - a.timestamp).map((bm) => (
                                <div key={bm.id} className="relative group">
                                    <button onClick={() => { jumpTo(bm.index); onClose(); }}
                                        className="w-full text-left p-6 pr-12 rounded-[2.5rem] bg-zinc-500/5 hover:bg-zinc-500/10 transition-all">
                                        <p className="text-[10px] font-black opacity-30 uppercase tracking-widest mb-2">{new Date(bm.timestamp).toLocaleDateString()}</p>
                                        <p className="text-[11px] font-bold italic line-clamp-2 opacity-80 leading-relaxed">"{bm.label}"</p>
                                    </button>
                                    <button onClick={() => deleteBookmark(bm.id)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 opacity-0 group-hover:opacity-40 hover:!opacity-100 text-red-500 transition-all">
                                        <Trash size={16} />
                                    </button>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
