"""Separate accounting for explicitly authorized final acceptance, not the old ledger."""
from datetime import datetime, timezone
from decimal import Decimal
import json
import os
from pathlib import Path


class FinalRunCosts:
    def __init__(self, path):
        self.path = Path(path).resolve()
        if self.path.suffix != '.json':
            raise ValueError('separate_JSON_accounting_required')
        if self.path.exists():
            self.data = json.loads(self.path.read_text())
            if self.data.get('authorization') != 'user_approved_final_mail_acceptance_2026-10-07':
                raise ValueError('final_run_authorization_required')
        else:
            self.data = {'authorization': 'user_approved_final_mail_acceptance_2026-10-07',
                'historical_ledger_replaced': False, 'fixed_limit_USD': None, 'entries': []}
            self._save()

    def _save(self):
        self.data['cumulative_accounted_USD'] = str(sum((Decimal(row['charged_micro_usd'] or 0)/1_000_000 for row in self.data['entries']), Decimal(0)))
        self.data['pending_entries'] = sum(row['state'] == 'pending' for row in self.data['entries'])
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        temporary = self.path.with_suffix('.tmp')
        with temporary.open('w') as output:
            os.chmod(temporary, 0o600)
            json.dump(self.data, output, indent=2)
            output.flush()
            os.fsync(output.fileno())
        temporary.replace(self.path)

    def reserve(self, identity, maximum_usd, model, pricing_revision):
        if any(row['id'] == identity for row in self.data['entries']):
            raise ValueError('cost_identity_conflict')
        self.data['entries'].append({'id': identity, 'timestamp': datetime.now(timezone.utc).isoformat(),
            'test': 'native_mail_browser_probe', 'model': model, 'sessions': 1 if not identity.endswith('-transcription') else 0,
            'estimated_reservation_USD': str(maximum_usd), 'charged_micro_usd': None,
            'state': 'pending', 'pricing_revision': pricing_revision})
        self._save()

    def reconcile(self, identity, measured_usd, *, complete):
        row = next(row for row in self.data['entries'] if row['id'] == identity)
        row['state'] = 'accounted_estimate' if complete and measured_usd is not None else 'pending'
        row['charged_micro_usd'] = int((Decimal(str(measured_usd))*1_000_000).to_integral_value(rounding='ROUND_CEILING')) if row['state'] != 'pending' else None
        self._save()

    def record_usage(self, identity, usage):
        row = next(row for row in self.data['entries'] if row['id'] == identity)
        row['usage'] = usage
        self._save()

    def snapshot(self):
        return {**self.data, 'available_micro_usd': None,
            'cumulative_accounted_USD': str(sum((Decimal(row['charged_micro_usd'] or 0)/1_000_000 for row in self.data['entries']), Decimal(0))),
            'pending_entries': sum(row['state'] == 'pending' for row in self.data['entries'])}
