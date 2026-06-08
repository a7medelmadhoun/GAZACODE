# GAZACODE - Git/GitHub Setup Guide

## الطريقة السريعة (بنقرة واحدة)

### 1. ثبّت Git (إذا مو مثبت)
حمّل من: https://git-scm.com/download/win

### 2. شغّل الـ Setup Script
من PowerShell داخل `C:\Users\wafa\Desktop\GazaCode`:

```powershell
.\setup.ps1
```

أو من CMD:
```
setup.bat
```

الـ script رح يسوي كل شي:
- يشيك إذا Git مثبت
- يسوي init للـ repo
- يسوي build للمشروع
- يضيف كل الملفات
- يسوي commit
- يضيف الـ remote
- يسوي push للـ GitHub

---

## الطريقة اليدوية

```powershell
cd C:\Users\wafa\Desktop\GazaCode

git init
git branch -M main
git add .
git commit -m "feat: GAZACODE v2.0 - multi-provider AI CLI with task planning"
git remote add origin https://github.com/a7medelmadhoun/GAZACODE.git
git push -u origin main
```

---

## رفع مشروع جديد (بُني مع GAZACODE)

```powershell
cd C:\path\to\your-project

git init
git branch -M main
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-username/your-repo.git
git push -u origin main
```

---

## Workflow يومي (بعد أول push)

```powershell
git status          # شوف التغييرات
git add .           # أضف كل شي
git commit -m "msg" # اكتب وصف
git push            # ارفع
```

---

## أوامر شائعة

| الأمر | الوظيفة |
|-------|---------|
| `git status` | يعرض الملفات المعدّلة |
| `git add .` | يضيف كل التغييرات |
| `git add <file>` | يضيف ملف معين |
| `git commit -m "msg"` | يحفظ التغييرات |
| `git log --oneline` | يعرض سجل الـ commits |
| `git push` | يرفع لـ GitHub |
| `git pull` | ينزل من GitHub |
| `git remote -v` | يعرض الـ repos المتصلة |
| `git branch` | يعرض الفروع |
| `git checkout -b name` | يسوي فرع جديد |

---

## حل المشاكل

| المشكلة | الحل |
|---------|------|
| `git is not recognized` | ثبّت Git من https://git-scm.com/download/win |
| `Permission denied` | شغّل PowerShell كـ Administrator |
| `Updates were rejected` | اعمل `git pull` قبل `git push` |
| `Repository not found` | تأكد من الرابط بـ `git remote -v` |
| `100 file limit` | استخدم Git بدل المتصفح |

---

## من داخل GAZACODE

ممكن تطلب من الـ AI يساعدك مع Git:
- "Show me how to push this folder to GitHub"
- "Make a .gitignore for a Node.js project"
- "What does `git rebase` do?"
