"""
Seed script — creates a user account (admin or regular).

Usage:
    cd backend
    source venv/bin/activate
    python seed_admin.py

Prompts for role, email, full name, and password interactively.
Safe to re-run: if the email already exists, it prints a message and exits.
"""

import asyncio
import getpass

import aiosqlite

from app.auth.utils import hash_password
from app.database import DB_PATH, init_db


async def create_user():
    """Prompt for user details and insert into the users table."""
    # Ensure DB and tables exist
    await init_db()

    print("\n── Create User ──\n")

    # Ask for role
    role = input("Role (admin/user) [user]: ").strip().lower() or "user"
    is_admin = 1 if role == "admin" else 0

    email = input("Email: ").strip()
    if not email:
        print("Error: email is required.")
        return

    full_name = input("Full name: ").strip() or None

    password = getpass.getpass("Password: ")
    if len(password) < 8:
        print("Error: password must be at least 8 characters.")
        return

    confirm = getpass.getpass("Confirm password: ")
    if password != confirm:
        print("Error: passwords do not match.")
        return

    hashed = hash_password(password)

    db = await aiosqlite.connect(DB_PATH)
    try:
        # Check if user already exists
        cursor = await db.execute("SELECT id FROM users WHERE email = ?", (email,))
        if await cursor.fetchone():
            print(f"\nUser '{email}' already exists. No changes made.")
            return

        await db.execute(
            "INSERT INTO users (email, password_hash, full_name, is_admin, is_active) "
            "VALUES (?, ?, ?, ?, 1)",
            (email, hashed, full_name, is_admin),
        )
        await db.commit()
        role_label = "Admin" if is_admin else "User"
        print(f"\n{role_label} '{email}' created successfully.")
    finally:
        await db.close()


if __name__ == "__main__":
    asyncio.run(create_user())
