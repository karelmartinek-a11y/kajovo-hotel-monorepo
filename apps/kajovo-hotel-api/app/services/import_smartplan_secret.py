"""Import the protected voice-host credential from stdin; never accept its value as an argument."""
import sys

from app.services.dagmar_adapter import create_dagmar
from dagmar_server.ports import bind
from dagmar_server.smartplan_storage import SmartPlanSecretStore


def main():
    value = sys.stdin.read(513).strip()
    with bind(create_dagmar().ports):
        SmartPlanSecretStore().save(value)
        assert SmartPlanSecretStore().read() == value
    print('SMARTPLAN_VOICE_HOST_TOKEN encrypted import verified')


if __name__ == '__main__':
    main()
