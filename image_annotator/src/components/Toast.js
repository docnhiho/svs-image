let showToastHandler = null;

export function registerToast(fn) {
    showToastHandler = fn;
}

export function toast(message, type = "default") {
    if (showToastHandler) {
        showToastHandler(message, type);
    } else {
        console.warn("Toast system chưa được khởi tạo");
    }
}

toast.success = (message) => toast(message, "success");
toast.error = (message) => toast(message, "error");
toast.warning = (message) => toast(message, "warning");