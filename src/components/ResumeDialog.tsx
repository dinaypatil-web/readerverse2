import React from 'react';
import { BookOpen, Play, RotateCcw } from 'lucide-react';
import { Book } from '../types';

interface ResumeDialogProps {
    isOpen: boolean;
    book: Book | null;
    onResume: () => void;
    onStartOver: () => void;
    onClose: () => void;
}

export const ResumeDialog: React.FC<ResumeDialogProps> = ({ isOpen, book, onResume, onStartOver, onClose }) => {
    if (!isOpen || !book) return null;

    const totalWords = book.displayBlocks.reduce((s, b) => s + b.wordCount, 0);
    const progress = totalWords > 0 ? ((book.lastIndex || 0) / totalWords * 100).toFixed(1) : '0';

    return (
        <div className="fixed inset-0 z-[250] bg-black/60 backdrop-blur-lg flex items-center justify-center p-8">
            <div className="bg-white dark:bg-zinc-900 rounded-[3rem] p-10 shadow-2xl max-w-sm w-full animate-fade-in">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-600/10 to-indigo-600/10 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <BookOpen size={28} />
                </div>
                <h3 className="text-lg font-black text-center mb-2">{book.title}</h3>
                <p className="text-xs text-center opacity-40 mb-2 uppercase tracking-widest font-bold">
                    Last read at word {book.lastIndex?.toLocaleString()}
                </p>
                <div className="w-full h-2 bg-zinc-500/10 rounded-full overflow-hidden mb-8">
                    <div className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
                <div className="space-y-3">
                    <button onClick={onResume}
                        className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-sm flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all hover:bg-blue-500">
                        <Play size={18} fill="currentColor" /> Resume Reading
                    </button>
                    <button onClick={onStartOver}
                        className="w-full py-4 bg-zinc-500/5 rounded-2xl font-black uppercase text-sm flex items-center justify-center gap-3 opacity-40 hover:opacity-100 active:scale-95 transition-all">
                        <RotateCcw size={18} /> Start from Beginning
                    </button>
                </div>
            </div>
        </div>
    );
};
