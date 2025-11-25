import { useState, useEffect } from "react";
import { registerToast } from "./Toast";
import styled from "styled-components";


const ToastInfor = styled.div`
    @keyframes slide {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .animate-slide {
        animation: slide 0.3s ease;
    }
    @keyframes slide-out {
        from { opacity: 1; transform: translateY(0); }
        to   { opacity: 0; transform: translateY(-10px); }
    }

    .animate-slide-out {
        animation: slide-out 0.3s ease forwards;
}
`

export default function ToastContainer() {
    const [toasts, setToasts] = useState([]);

    const addToast = (message, type = "default") => {
        const id = Date.now();

        setToasts(prev => [...prev, { id, message, type, isLeaving: false }]);

        setTimeout(() => {
            setToasts(prev =>
                prev.map(t => t.id === id ? { ...t, isLeaving: true } : t)
            );

            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, 300);
        }, 2500);
    };

    useEffect(() => {
        registerToast(addToast);
    }, []);

    const getColor = (type) => {
        switch (type) {
            case "success":
                return "bg-green-600";
            case "error":
                return "bg-red-600";
            case "warning":
                return "bg-yellow-500 text-black";
            default:
                return "bg-gray-800";
        }
    };

    return (
        <ToastInfor>
            <div className="fixed top-4 right-4 space-y-2 z-50">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={`px-4 py-2 rounded-lg shadow-lg text-white
                                    ${getColor(t.type)}
                                    ${t.isLeaving ? "animate-slide-out" : "animate-slide"}
          `}
                    >
                        {t.message}
                    </div>
                ))}
            </div>
        </ToastInfor>

    );
}