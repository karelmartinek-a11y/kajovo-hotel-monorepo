from __future__ import annotations

import queue
import threading
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

try:
    from yolo_text_repair import TEXT_EXTENSIONS, run_yolo_repair
except ImportError:
    from scripts.yolo_text_repair import TEXT_EXTENSIONS, run_yolo_repair


MAX_ROOTS = 5


class App:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("YOLO Text Repair")
        self.root.geometry("980x760")
        self.dir_vars = [tk.StringVar() for _ in range(MAX_ROOTS)]
        self.backup_var = tk.StringVar()
        self.worker: threading.Thread | None = None
        self.events: queue.SimpleQueue[tuple[str, object]] = queue.SimpleQueue()
        self._build()
        self.root.after(50, self._drain_events)

    def _build(self) -> None:
        frame = ttk.Frame(self.root, padding=12)
        frame.pack(fill="both", expand=True)

        ttk.Label(
            frame,
            text="Vyberte az 5 adresaru a jeden backup adresar. Program udela plnou ZIP zalohu kazdeho vybraneho adresare a pak primo prepise textove soubory i ZIPy uvnitr techto adresaru.",
            wraplength=940,
            justify="left",
        ).pack(anchor="w", pady=(0, 12))

        dirs = ttk.LabelFrame(frame, text="Zdrojove adresare")
        dirs.pack(fill="x", pady=(0, 12))
        for idx, var in enumerate(self.dir_vars, start=1):
            row = ttk.Frame(dirs, padding=4)
            row.pack(fill="x")
            ttk.Label(row, text=f"Adresar {idx}", width=12).pack(side="left")
            ttk.Entry(row, textvariable=var).pack(side="left", fill="x", expand=True, padx=(0, 8))
            ttk.Button(row, text="Vybrat", command=lambda v=var: self._pick_dir(v)).pack(side="left")

        backup = ttk.LabelFrame(frame, text="Backup adresar")
        backup.pack(fill="x", pady=(0, 12))
        row = ttk.Frame(backup, padding=4)
        row.pack(fill="x")
        ttk.Entry(row, textvariable=self.backup_var).pack(side="left", fill="x", expand=True, padx=(0, 8))
        ttk.Button(row, text="Vybrat", command=lambda: self._pick_dir(self.backup_var)).pack(side="left")

        definition = ttk.LabelFrame(frame, text="Definice textoveho souboru")
        definition.pack(fill="x", pady=(0, 12))
        text = tk.Text(definition, height=8, wrap="word")
        text.pack(fill="x", padx=6, pady=6)
        text.insert(
            "1.0",
            "Za textovy soubor program povazuje soubor s touto priponou nebo timto nazvem:\n\n"
            + ", ".join(sorted(TEXT_EXTENSIONS)),
        )
        text.configure(state="disabled")

        actions = ttk.Frame(frame)
        actions.pack(fill="x", pady=(0, 12))
        self.start_button = ttk.Button(actions, text="Spustit opravu", command=self._start)
        self.start_button.pack(side="left")
        ttk.Button(actions, text="Zavrit", command=self.root.destroy).pack(side="left", padx=(8, 0))

        log_box = ttk.LabelFrame(frame, text="Log")
        log_box.pack(fill="both", expand=True)
        self.log = tk.Text(log_box, wrap="word", height=22)
        self.log.pack(fill="both", expand=True, padx=6, pady=6)
        self.log.configure(state="disabled")

    def _pick_dir(self, variable: tk.StringVar) -> None:
        selected = filedialog.askdirectory(parent=self.root)
        if selected:
            variable.set(selected)

    def _append(self, message: str) -> None:
        self.events.put(("log", message))

    def _set_running(self, running: bool) -> None:
        self.events.put(("running", running))

    def _drain_events(self) -> None:
        while True:
            try:
                kind, payload = self.events.get_nowait()
            except queue.Empty:
                break

            if kind == "log":
                self.log.configure(state="normal")
                self.log.insert("end", f"{payload}\n")
                self.log.see("end")
                self.log.configure(state="disabled")
            elif kind == "running":
                self.start_button.configure(state="disabled" if payload else "normal")
            elif kind == "info":
                messagebox.showinfo("YOLO Text Repair", str(payload))
            elif kind == "error":
                messagebox.showerror("YOLO Text Repair", str(payload))

        self.root.after(50, self._drain_events)

    def _start(self) -> None:
        if self.worker and self.worker.is_alive():
            return

        roots = [Path(var.get().strip()) for var in self.dir_vars if var.get().strip()]
        backup_dir = Path(self.backup_var.get().strip()) if self.backup_var.get().strip() else None

        if not roots:
            messagebox.showerror("YOLO Text Repair", "Vyberte alespon jeden zdrojovy adresar.")
            return
        if len(roots) > MAX_ROOTS:
            messagebox.showerror("YOLO Text Repair", f"Vybrat lze maximalne {MAX_ROOTS} adresaru.")
            return
        if backup_dir is None:
            messagebox.showerror("YOLO Text Repair", "Vyberte backup adresar.")
            return
        for root in roots:
            if not root.exists() or not root.is_dir():
                messagebox.showerror("YOLO Text Repair", f"Adresar neexistuje: {root}")
                return
        if backup_dir.exists() and not backup_dir.is_dir():
            messagebox.showerror("YOLO Text Repair", f"Backup cesta neni adresar: {backup_dir}")
            return

        self.log.configure(state="normal")
        self.log.delete("1.0", "end")
        self.log.configure(state="disabled")
        self._set_running(True)

        def work() -> None:
            try:
                stats = run_yolo_repair(roots, backup_dir, logger=self._append)
                self._append("")
                self._append("Hotovo.")
                self._append(f"Textove soubory: {stats.scanned_text_files}, zmenene: {stats.changed_text_files}")
                self._append(f"ZIP soubory: {stats.scanned_zip_files}, zmenene: {stats.changed_zip_files}")
                self.events.put(("info", "Oprava dokoncena."))
            except Exception as exc:
                self._append(f"Chyba: {exc}")
                self.events.put(("error", str(exc)))
            finally:
                self._set_running(False)

        self.worker = threading.Thread(target=work, daemon=True)
        self.worker.start()


def main() -> int:
    root = tk.Tk()
    App(root)
    root.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
