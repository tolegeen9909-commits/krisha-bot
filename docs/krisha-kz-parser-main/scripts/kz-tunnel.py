#!/usr/bin/env python3
"""
Поднять SOCKS5 SSH-туннель через казахстанский сервер (10.8.0.13 — VPN).

Читает SSH-ключ из Azure Key Vault, запускает:
  ssh -D 1080 -N -i <tmpkey> svc-ssh@10.8.0.13

Требует: активное VPN-соединение с сетью 10.8.0.0/24.

Запуск (foreground — Ctrl+C чтобы остановить):
    python3 scripts/kz-tunnel.py

Запуск в фоне:
    python3 scripts/kz-tunnel.py --detach

После запуска использовать в Docker:
    docker compose run -e ALL_PROXY=socks5h://host.docker.internal:1080 bot python cli.py task run 2
"""

import argparse
import base64
import os
import shlex
import stat
import subprocess
import sys
import tempfile

KV_URL = os.environ.get("AZURE_KEYVAULT_URL", "https://kv-bronxtc-dev.vault.azure.net/")
PROXY_PORT = 1080

_KEY_SECRET = "windesktop--mh-central--VPN-SSH-PRIVATE-KEY"
_CMD_SECRET = "windesktop--mh-central--CONNECT-COMMAND"


def _get_b64_secret(name: str) -> str:
    from azure.identity import DefaultAzureCredential
    from azure.keyvault.secrets import SecretClient
    client = SecretClient(vault_url=KV_URL, credential=DefaultAzureCredential())
    raw = client.get_secret(name).value
    return base64.b64decode(raw).decode("utf-8").strip()


def _replace_identity_flag(parts: list[str], new_key_path: str) -> list[str]:
    """Replace existing -i <path> in ssh args with new_key_path, or append if absent."""
    result = []
    i = 0
    replaced = False
    while i < len(parts):
        if parts[i] == "-i" and i + 1 < len(parts):
            result += ["-i", new_key_path]
            i += 2
            replaced = True
        else:
            result.append(parts[i])
            i += 1
    if not replaced:
        result += ["-i", new_key_path]
    return result


def main():
    parser = argparse.ArgumentParser(description="KZ SSH SOCKS5 tunnel")
    parser.add_argument("--detach", action="store_true", help="Запустить в фоне (-f)")
    parser.add_argument("--port", type=int, default=PROXY_PORT, help=f"Порт SOCKS5 (default {PROXY_PORT})")
    args = parser.parse_args()

    print("Загружаю SSH-ключ из Azure Key Vault...")
    try:
        private_key = _get_b64_secret(_KEY_SECRET)
        connect_cmd = _get_b64_secret(_CMD_SECRET)
    except Exception as exc:
        print(f"Ошибка Key Vault: {exc}", file=sys.stderr)
        print("Проверь: AZURE_KEYVAULT_URL, az login / managed identity.", file=sys.stderr)
        sys.exit(1)

    print(f"Сервер: {connect_cmd}")

    # Записываем ключ во временный файл
    key_fd, key_path = tempfile.mkstemp(suffix=".pem", prefix="kz-ssh-")
    try:
        with os.fdopen(key_fd, "w") as f:
            f.write(private_key + "\n")
        os.chmod(key_path, stat.S_IRUSR | stat.S_IWUSR)  # 600

        # Собираем команду туннеля
        base_parts = shlex.split(connect_cmd)
        tunnel_parts = _replace_identity_flag(base_parts, key_path)
        tunnel_parts += [
            "-D", str(args.port),
            "-N",
            "-o", "StrictHostKeyChecking=accept-new",
            "-o", "ExitOnForwardFailure=yes",
            "-o", "ServerAliveInterval=30",
            "-o", "ServerAliveCountMax=3",
        ]
        if args.detach:
            tunnel_parts.append("-f")

        print(f"\nЗапускаю SOCKS5 туннель на localhost:{args.port}...")
        if args.detach:
            print("(фоновый режим — PID SSH-процесса вернётся сразу)")

        try:
            subprocess.run(tunnel_parts, check=True)
        except subprocess.CalledProcessError as exc:
            print(f"\nОшибка SSH (код {exc.returncode}).", file=sys.stderr)
            print("Проверь что VPN активен и сервер доступен: ping 10.8.0.13", file=sys.stderr)
            sys.exit(1)
        except KeyboardInterrupt:
            print("\nТуннель остановлен (Ctrl+C).")
    finally:
        if not args.detach:
            os.unlink(key_path)
            print("Временный ключ удалён.")
        else:
            print(f"\nВременный ключ: {key_path}")
            print(f"Удалить после остановки: pkill -f 'ssh.*:{args.port}' && rm {key_path}")

    if args.detach:
        print(f"\n✓ Туннель активен: socks5h://localhost:{args.port}")
        print("\nДля Docker:")
        print(f"  docker compose run -e ALL_PROXY=socks5h://host.docker.internal:{args.port} bot python cli.py task run 2")
        print("\nДля локального Python:")
        print(f"  ALL_PROXY=socks5h://localhost:{args.port} python cli.py task run 2")


if __name__ == "__main__":
    main()
