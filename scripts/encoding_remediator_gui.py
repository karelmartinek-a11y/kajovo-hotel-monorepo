from __future__ import annotations

import threading
from datetime import datetime
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from bulk_encoding_remediator import run_bulk_job


MAX_ROOTS = 5


class EncodingRemediatorApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Encoding Remediator")
        self.root.geometry("980x720")

        self.directory_vars = [tk.StringVar() for _ in range(MAX_ROOTS)]
        self.include_zips_var = tk.BooleanVar(value=True)
        self.replace_zips_var = tk.BooleanVar(value=True)
        self.apply_changes_var = tk.BooleanVar(value=True)
        self.confidence_var = tk.StringVar(value="0.88")
        self.output_var = tk.StringVar(
            value=str(Path.home() / "codex-encoding-runs" / datetime.now().strftime("%Y%m%d-%H%M%S"))
        )
        self.worker: threading.Thread | None = None

        self._build_ui()

    def _build_ui(self) -> None:
        frame = ttk.Frame(self.root, padding=12)
        frame.pack(fill="both", expand=True)

        intro = ttk.Label(
            frame,
            text="Vyber az 5 adresaru. Program projde textove soubory, muze opravit high-confidence encoding chyby a u ZIPu po oprave prepise puvodni archiv se zalohou.",
            wraplength=920,
            justify="left",
        )
        intro.pack(anchor="w", pady=(0, 12))

        dirs_frame = ttk.LabelFrame(frame, text="Adresare")
        dirs_frame.pack(fill="x", pady=(0, 12))
        for index, variable in enumerate(self.directory_vars, start=1):
            row = ttk.Frame(dirs_frame, padding=4)
            row.pack(fill="x")
            ttk.Label(row, text=f"Adresar {index}", width=12).pack(side="left")
            ttk.Entry(row, textvariable=variable).pack(side="left", fill="x", expand=True, padx=(0, 8))
            ttk.Button(row, text="Vybrat", command=lambda v=variable: self._choose_directory(v)).pack(side="left")

        options = ttk.LabelFrame(frame, text="Volby")
        options.pack(fill="x", pady=(0, 12))

        ttk.Checkbutton(options, text="Prohledat i ZIP archivy", variable=self.include_zips_var).pack(anchor="w", padx=8, pady=4)
        ttk.Checkbutton(
            options,
            text="Opravit soubory a zapisovat zmeny",
            variable=self.apply_changes_var,
            command=self._sync_option_state,
        ).pack(anchor="w", padx=8, pady=4)
        ttk.Checkbutton(
            options,
            text="Po oprave nahradit puvodni ZIP pod stejnym nazvem",
            variable=self.replace_zips_var,
        ).pack(anchor="w", padx=8, pady=4)

        threshold_row = ttk.Frame(options, padding=4)
        threshold_row.pack(fill="x")
        ttk.Label(threshold_row, text="Confidence threshold", width=18).pack(side="left")
        ttk.Entry(threshold_row, textvariable=self.confidence_var, width=10).pack(side="left")
        ttk.Label(threshold_row, text="(doporuceno 0.88 az 0.95)").pack(side="left", padx=(8, 0))

        output_row = ttk.Frame(options, padding=4)
        output_row.pack(fill="x")
        ttk.Label(output_row, text="Output root", width=18).pack(side="left")
        ttk.Entry(output_row, textvariable=self.output_var).pack(side="left", fill="x", expand=True, padx=(0, 8))
        ttk.Button(output_row, text="Vybrat", command=self._choose_output).pack(side="left")

        actions = ttk.Frame(frame)
        actions.pack(fill="x", pady=(0, 12))
        self.start_button = ttk.Button(actions, text="Spustit", command=self._start_run)
        self.start_button.pack(side="left")
        ttk.Button(actions, text="Zavrit", command=self.root.destroy).pack(side="left", padx=(8, 0))

        log_frame = ttk.LabelFrame(frame, text="Log")
        log_frame.pack(fill="both", expand=True)
        self.log_widget = tk.Text(log_frame, wrap="word", height=24)
        self.log_widget.pack(fill="both", expand=True, padx=6, pady=6)
        self.log_widget.configure(state="disabled")

        self._sync_option_state()

    def _choose_directory(self, variable: tk.StringVar) -> None:
        selected = filedialog.askdirectory(parent=self.root)
        if selected:
            variable.set(selected)

    def _choose_output(self) -> None:
        selected = filedialog.askdirectory(parent=self.root)
        if selected:
            self.output_var.set(selected)

    def _sync_option_state(self) -> None:
        if not self.apply_changes_var.get():
            self.replace_zips_var.set(False)

    def _append_log(self, message: str) -> None:
        def write() -> None:
            self.log_widget.configure(state="normal")
            self.log_widget.insert("end", message + "\n")
            self.log_widget.see("end")
            self.log_widget.configure(state="disabled")

        self.root.after(0, write)

    def _set_running(self, running: bool) -> None:
        def update() -> None:
            state = "disabled" if running else "normal"
            self.start_button.configure(state=state)

        self.root.after(0, update)

    def _start_run(self) -> None:
        if self.worker and self.worker.is_alive():
            messagebox.showinfo("Encoding Remediator", "Beh uz probiha.")
            return

        roots = [Path(value.get().strip()) for value in self.directory_vars if value.get().strip()]
        if not roots:
            messagebox.showerror("Encoding Remediator", "Vyberte alespon jeden adresar.")
            return
        if len(roots) > MAX_ROOTS:
            messagebox.showerror("Encoding Remediator", f"Lze vybrat maximalne {MAX_ROOTS} adresaru.")
            return
        for root in roots:
            if not root.exists() or not root.is_dir():
                messagebox.showerror("Encoding Remediator", f"Adresar neexistuje: {root}")
                return

        try:
            confidence = float(self.confidence_var.get().strip())
        except ValueError:
            messagebox.showerror("Encoding Remediator", "Confidence threshold musi byt cislo, napr. 0.88.")
            return

        apply_changes = self.apply_changes_var.get()
        replace_zips = self.replace_zips_var.get() if apply_changes else False
        include_zips = self.include_zips_var.get()
        output_root = Path(self.output_var.get().strip())

        self.log_widget.configure(state="normal")
        self.log_widget.delete("1.0", "end")
        self.log_widget.configure(state="disabled")
        self._append_log("Startuji beh...")
        self._set_running(True)

        def worker() -> None:
            try:
                exit_code, run_root = run_bulk_job(
                    roots=roots,
                    apply_changes=apply_changes,
                    include_zips=include_zips,
                    replace_zips=replace_zips,
                    confidence_threshold=confidence,
                    output_root=output_root,
                    logger=self._append_log,
                )
                self._append_log("")
                self._append_log(f"Hotovo. Exit code: {exit_code}")
                self._append_log(f"Report: {run_root / 'summary.md'}")
                self.root.after(
                    0,
                    lambda: messagebox.showinfo(
                        "Encoding Remediator",
                        f"Beh dokoncen.\n\nReport:\n{run_root / 'summary.md'}",
                    ),
                )
            except Exception as exc:
                self._append_log(f"Chyba: {exc}")
                self.root.after(0, lambda: messagebox.showerror("Encoding Remediator", str(exc)))
            finally:
                self._set_running(False)

        self.worker = threading.Thread(target=worker, daemon=True)
        self.worker.start()


def main() -> int:
    root = tk.Tk()
    app = EncodingRemediatorApp(root)
    root.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
