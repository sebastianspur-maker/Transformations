# Firebase / Google sign-in setup

The app code is configured for Google sign-in and permits only these account domains:

- Students: `@s.michaelham.org.ar`
- Teachers: `@t.michaelham.org.ar`

The role is derived from the signed-in Google email. It is not chosen by the user.

## 1. Confirm the Firebase project used by Vercel

In Vercel, open the `v0-transformations-app` project and check Settings > Environment Variables.
The value of `NEXT_PUBLIC_FIREBASE_PROJECT_ID` identifies the Firebase project to configure.

The app expects these variables:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

## 2. Enable Google Authentication

Firebase Console > Authentication > Sign-in method > Google > Enable.
Choose a project support email and save.

## 3. Add authorized domains

Firebase Console > Authentication > Settings > Authorized domains.
Add:

- `v0-transformations-app.vercel.app`
- any custom production domain used later
- `localhost` if local testing is required

## 4. Publish Firestore security rules

Firebase Console > Firestore Database > Rules.
Copy the contents of `firestore.rules` from this project and click Publish.

These rules enforce the authorization at the database layer:

- only `@s.michaelham.org.ar` and `@t.michaelham.org.ar` authenticated users are accepted;
- students can write/read only their own profile and practice attempts;
- teachers can read all student profiles and attempts;
- students cannot query the teacher analytics data;
- teacher/student role is derived from the email domain and cannot be self-selected.

## 5. Google Workspace admin check (only if sign-in is blocked)

If school Google accounts show an administrator-blocked / app-not-trusted message, a Michael Ham Google Workspace administrator must review the OAuth app in Google Admin Console under Security > Access and data control > API controls > App access control and allow/trust the OAuth client used by this Firebase project.

## 6. Test before production

Test with one student account and one teacher account:

Student (`@s...`):
- can enter the learning app;
- cannot see Teacher Panel;
- practice is recorded.

Teacher (`@t...`):
- can enter the learning app;
- sees Teacher Panel;
- can see student activity and analytics.

External account (Gmail or any other domain):
- is immediately signed out and denied access.