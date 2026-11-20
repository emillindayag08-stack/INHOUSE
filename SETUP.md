# Putting CODI-IS on GitHub, and running it on another computer

Two parts. **Part 1** you do once, on the computer that has the project now.
**Part 2** you do on the laptop, and again on any other machine.

---

## Part 1 — Upload the project to GitHub

### 1. Create an empty repository

Go to <https://github.com/new> and fill in:

| Field | What to do |
|---|---|
| Repository name | `codi-is` (or any name you like) |
| Public / Private | **Private** — this is your capstone, and `ACCOUNTS.md` lists every demo login |
| Add a README file | **Leave unchecked** |
| Add .gitignore | **None** |
| Choose a license | **None** |

Click **Create repository**. GitHub then shows a page of setup commands — ignore it, use the ones below.

> The three "leave empty" choices matter. If GitHub creates any file in the repo, your first push is rejected as a conflict.

### 2. Point the project at that repository

Open a terminal **in the project folder** (`Desktop\Capstone Project`) and run the three commands below, one at a time. Replace `YOUR-USERNAME` and `YOUR-REPO` with your GitHub username and the name you just chose.

```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
```

```bash
git branch -M main
```

```bash
git push -u origin main
```

On the last one a browser window opens asking you to sign in to GitHub. Do that, and the upload starts. It only asks the first time.

### 3. Check it worked

Refresh your repository page on GitHub. You should see the `client` and `server` folders and the README. That's everything uploaded.

**Later, whenever you change something**, three commands send the changes up:

```bash
git add -A
```

```bash
git commit -m "Describe what you changed"
```

```bash
git push
```

---

## Part 2 — Run it on the laptop

### What the laptop needs first

Install these three, in any order. Each installer is a normal Next-Next-Finish.

1. **Node.js 20 or newer** — <https://nodejs.org> (take the LTS version)
2. **PostgreSQL 17** — <https://www.postgresql.org/download/windows/>
   During installation it asks you to set a **password for the `postgres` user**. Write that password down; you need it in step 3.
3. **Git** — <https://git-scm.com/download/win>

To confirm they installed, open a new terminal and run:

```bash
node -v
```

```bash
git --version
```

Both should print a version number. If a command is "not recognised", close the terminal, open a new one, and try again — installers only update the PATH for new terminals.

### 1. Download the project

```bash
git clone https://github.com/YOUR-USERNAME/YOUR-REPO.git
```

```bash
cd YOUR-REPO
```

### 2. Install the packages

Two separate installs, one per folder. Each takes a few minutes.

```bash
cd server && npm install
```

```bash
cd ../client && npm install
```

```bash
cd ..
```

### 3. Create the database

Open **pgAdmin** (installed with PostgreSQL), connect using the password from the PostgreSQL install, right-click **Databases → Create → Database**, name it `codi_is`, and save.

Prefer the terminal? This does the same thing — it will ask for that password:

```bash
psql -U postgres -c "CREATE DATABASE codi_is;"
```

### 4. Tell the app where the database is

The file with the database password is deliberately **not** on GitHub, so create it on the laptop.

Copy `server/.env.example` to a new file called `server/.env`:

```bash
cd server && cp .env.example .env
```

Open `server/.env` in a text editor. Replace `YOUR-PASSWORD` below with the PostgreSQL password from the install, and make the file read:

```
DATABASE_URL="postgresql://postgres:YOUR-PASSWORD@localhost:5432/codi_is"
JWT_SECRET="any-long-random-string-you-make-up"
PORT=4000
CLIENT_ORIGIN="http://localhost:5173"
```

`JWT_SECRET` can be any long jumble of characters — it just has to exist and stay private.

Optional: to turn on the **AI case summaries**, get a free Google Gemini key at https://aistudio.google.com/apikey and add it as `GEMINI_API_KEY="..."`. (A paid Claude key in `ANTHROPIC_API_KEY` works too.) Without a key, the rest of the system works without summaries.

### 5. Build the tables and the demo accounts

From the `server` folder:

```bash
npx prisma migrate deploy
```

```bash
npx prisma generate
```

```bash
npm run seed
```

The first replays all 38 migrations to build the tables, the second prepares the database code, the third creates the 63 accounts listed in `ACCOUNTS.md`. Optionally, add a few worked-through demo cases:

```bash
npm run seed:demo
```

### 6. Start it

The app is two programs, so it needs **two terminals open at the same time**.

**Terminal 1** — the server, from the `server` folder:

```bash
npm run dev
```

**Terminal 2** — the website, from the `client` folder:

```bash
npm run dev
```

Leave both running and open <http://localhost:5173> in your browser.

Sign in with any account from `ACCOUNTS.md`. The password for all of them is `Passw0rd!`. To see the whole system, start as `secretariat@bulsu.edu.ph`.

To stop either program, click its terminal and press `Ctrl + C`.

---

## If something goes wrong

| What you see | What it means | Fix |
|---|---|---|
| `Can't reach database server at localhost:5432` | PostgreSQL isn't running, or `DATABASE_URL` is wrong | Open **Services** in Windows, find `postgresql-x64-17`, and start it. Then re-check the password in `server/.env`. |
| `Authentication failed against database server` | Wrong password in `DATABASE_URL` | Retype it in `server/.env`. If the password has `@ : / ?` in it, those must be percent-encoded — simplest is to set a password with letters and numbers only. |
| `database "codi_is" does not exist` | Step 3 was skipped | Create the database, then run step 5 again. |
| `Error: P1001` or `P1000` | Same as the two above | As above. |
| Website loads but every action fails | The server terminal isn't running | Start Terminal 1 (step 6). Both must run at once. |
| `EADDRINUSE: port 4000` | Something else uses that port | Close the other program, or change `PORT` in `server/.env`. |
| `'npm' is not recognised` | Node.js isn't installed, or the terminal is stale | Install Node.js, then open a **new** terminal. |
| Login says invalid credentials | The seed hasn't run | Run `npm run seed` in `server`. |

**Starting the database over from scratch** (this erases every case — from the `server` folder):

```bash
npx prisma migrate reset
```

---

## Moving your current data to the laptop

The steps above give you a **fresh** database: the accounts, and nothing else. The cases you have been testing with stay on this computer, because the database lives in PostgreSQL rather than in the project folder.

That is usually what you want. If you do need the same cases on the laptop, say so and the data can be exported to a file and loaded there.

Two other things are on this computer only, by design:

- **`server/.env`** — holds your database password, so it must never go to GitHub. You recreate it in step 4.
- **`server/uploads/`** — the files people upload through the app. A fresh install starts with none.
