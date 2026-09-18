'use strict';
/**
 * Employee-facing help for Simran: how the Lighthouse app works. Admin-only features
 * (ratings, work rules, staff import, payroll, clients, reports) are deliberately left out.
 * `keys` are lowercase words/phrases matched against the question (rule mode);
 * the whole guide is also given to Claude as reference (smart mode).
 */
const FAQ = [
  { topic: 'Clock in', keys: ['clock in', 'clockin', 'punch in', 'attendance kaise', 'clock kaise', 'check in', 'selfie', 'location', 'gps', 'camera'],
    a: 'Home page pe "Clock In" dabao. App location lega aur ek selfie lega (chhoti photo, 30 din baad khud delete). Pehle mode chuno: Office, Work from home ya On field. App kholte hi "Slide to clock in" screen bhi aati hai. Camera allow karna zaroori hai.' },
  { topic: 'Clock out', keys: ['clock out', 'clockout', 'punch out', 'check out', 'midnight', 'raat', 'late night', '12 baje', 'next day'],
    a: 'Kaam khatam hone pe Home pe "Clock Out" dabao. Raat 12 ke baad bhi clock out kar sakte ho, punch kal wali date pe hi rahega aur OT sahi ginega. Clock out ke baad dobara kaam shuru karna ho to "Re-Clock In" se nayi session shuru hoti hai.' },
  { topic: 'Late / grace', keys: ['late', 'grace', 'der se', 'deri', 'late mark'],
    a: 'Shift start ke baad 20 minute tak grace hai (jaise Day shift 11:00 → 11:20 tak theek). Uske baad clock-in "Late" mark hota hai, jo dashboard aur attendance mein dikhta hai.' },
  { topic: 'Overtime', keys: ['overtime', 'ot ', ' ot', 'extra hours', 'zyada kaam'],
    a: 'Shift ke "OT after" time ke baad (Day shift 8 pm, Evening shift 11 pm) kaam automatically overtime ginta hai, hourly rate pe. Dashboard ke Overtime tile mein mahine ka OT dikhta hai.' },
  { topic: 'Breaks', keys: ['break', 'lunch', 'khana', 'chai', 'rest'],
    a: 'Clock-in ke baad Home pe "☕ Take a break" dabao, wapas aake "▶ End break". Ek din mein kitne bhi breaks le sakte ho. Break ka time worked hours aur productive hours dono se minus hota hai.' },
  { topic: 'Work from home / On field', keys: ['wfh', 'work from home', 'ghar se', 'field', 'on field', 'bahar', 'shoot pe', 'client site'],
    a: 'Clock-in ke time mode chuno: Office, Work from home ya On field. WFH pehle se approve ho (Leaves / WFH page se apply karke) to clock-in automatically WFH ban jaata hai. WFH aur field din normal working days hain, leave nahi.' },
  { topic: 'Leave apply', keys: ['leave apply', 'leave kaise', 'chutti kaise', 'chhutti kaise', 'apply leave', 'leave lena', 'leave request', 'approval', 'approve'],
    a: 'Leaves / WFH page (More menu) ya Quick Actions → "Apply leave / WFH". Type (Leave ya WFH), dates aur remarks bharo. Request admin ke paas pending jaati hai; approve/reject hone pe notification aati hai. Pending request tum khud withdraw kar sakte ho.' },
  { topic: 'Leave balance', keys: ['leave balance', 'leaves left', 'kitni leave', 'quota', 'bachi', 'remaining leave'],
    a: 'Saal mein 12 paid leaves milti hain (admin badal sakta hai). Balance dashboard ke "Leaves left" tile aur Leaves page ke upar dikhta hai: used, pending, left. WFH leave mein count nahi hoti, week-off ke din bhi nahi.' },
  { topic: 'Holidays & events', keys: ['holiday', 'events', 'birthday', 'anniversary', 'festival', 'off day', 'sunday'],
    a: 'Events page (More menu) mein upcoming holidays, birthdays aur work anniversaries dikhte hain. Weekly off har person ka alag ho sakta hai (default Sunday), admin set karta hai. Holiday aur week-off ke din attendance count nahi hoti.' },
  { topic: 'Tasks workflow', keys: ['task kaise', 'task accept', 'accept', 'submit', 'approval', 'changes', 'in progress', 'pipeline', 'task flow', 'task status', 'timer'],
    a: 'Naya task "New" mein aata hai → "Accept" dabao to timer shuru aur task In progress. Kaam hone pe "Submit for approval" → team leader approve kare to Completed, ya "Changes" maange to wapas tumhare paas aata hai. Timer sirf In progress mein chalta hai: Submit karte hi ruk jaata hai (approval ka wait time nahi ginta), Changes aaye to Resume pe dobara chalta hai. Isi se productive hours aur score bante hain.' },
  { topic: 'Self task', keys: ['self task', 'apna task', 'khud task', 'own task', 'task banana'],
    a: 'Quick Actions → "Self Task" se apna task khud bana sakte ho (jab koi assigned task na ho par kaam chal raha ho). Wo bhi timer ke saath chalta hai aur productive hours mein ginta hai.' },
  { topic: 'Task deadline & reassign', keys: ['deadline', 'due', 'reassign', 'kisi aur ko', 'overdue', 'reject task'],
    a: 'Har task ki deadline card pe dikhti hai, overdue red ho jaata hai. Task kisi aur ko dena ho to team leader se reassign karwao. Deadline pe ya pehle deliver karne pe score mein bonus milta hai.' },
  { topic: 'Projects', keys: ['project', 'client project', 'allocated hours', 'project page'],
    a: 'Projects page pe saare projects, unke tasks, team leader aur allocated vs used hours dikhte hain. Task hamesha kisi project ke andar hota hai.' },
  { topic: 'Performance score', keys: ['score kaise', 'points kaise', 'marks kaise', 'performance kaise', 'rank kaise', 'top 5', 'top performer', 'leaderboard', 'scoring'],
    a: 'Score 100 ka hai: 50 software se (Volume 20: task points, creative kaam ×1.5; On time 15: deadline tak submit; Efficiency 10: allocated hours ke andar; Attendance 5) aur 50 admin marks. Approval ke liye submit kiye tasks bhi ginte hain. Top 5 dashboard pe sabko dikhte hain. Har mahine fresh.' },
  { topic: 'Productive hours', keys: ['productive', 'productive hours', 'task time', 'kitna kaam kiya'],
    a: 'Productive hours = tasks pe In-progress ka time, sirf jab clocked in ho, breaks minus. Clock hours alag hain. Dashboard pe dono dikhte hain. Task ke bina kaam ho raha ho to Self Task bana lo, warna wo time productive mein nahi ginega.' },
  { topic: 'Dashboard', keys: ['dashboard', 'home page', 'charts', 'graph', 'ring', 'donut'],
    a: 'Home pe: clock card, aaj ka worked-hours ring, mahine ke daily hours bars, attendance donut, KPIs (avg hours, late, productive, leaves left, OT, tasks, pending pay), performance top 5 aur tumhara score, open tasks aur to-do list.' },
  { topic: 'Notifications', keys: ['notification', 'alert', 'bell', 'announcement', 'mark read', 'clear'],
    a: 'Notifications page (mobile: Alerts) pe task assign, approval, leave decision aur admin announcements aate hain. Wahin se Accept / Approve jaise actions direct ho jaate hain. "Mark all read" aur delete/clear bhi hai.' },
  { topic: 'Push notifications', keys: ['push', 'push notification', 'notification kaise', 'notification on', 'notification enable', 'phone pe notification', 'notification nahi aa', 'enable notification', 'allow notification', 'home screen', 'install', 'add to home'],
    a: 'Notifications page ke banner ya Settings → Push notifications → Enable. Browser "Allow" maangega. iPhone pe pehle Safari Share → "Add to Home Screen" karo aur wahan se app kholo, tabhi push chalega. Settings mein "Send test" se check kar lo.' },
  { topic: 'Password', keys: ['password', 'passwd', 'forgot', 'reset', 'login nahi', 'change password'],
    a: 'Settings → Your account → "Change password" (current password chahiye, naya 6+ characters). Login page pe "Forgot Password?" se reset mail aati hai. Login ek baar karne pe device pe 1 saal tak bana rehta hai.' },
  { topic: 'Theme', keys: ['theme', 'dark', 'light', 'white mode', 'color'],
    a: 'Settings → Appearance → Dark ya Light. Device pe save hota hai.' },
  { topic: 'Attendance page', keys: ['attendance page', 'attendance summary', 'meri attendance', 'attendance dekh', 'history', 'purani attendance'],
    a: 'Attendance page pe din chunke sabki clock-in/out, mode (Office/WFH/Field), late aur selfie 📷 dikhti hai. Apna mahina dashboard ke charts aur Attendance donut mein dikhta hai.' },
  { topic: 'To-do list', keys: ['todo', 'to-do', 'to do', 'checklist', 'reminder'],
    a: 'Dashboard ke "My to-do list" mein personal notes/to-dos add karo (Enter ya + se). Ye sirf tumhe dikhte hain, task nahi hain.' },
  { topic: 'Staff & departments', keys: ['staff', 'team member', 'department', 'contact', 'phone number', 'kaun hai'],
    a: 'Staff page pe team ke naam, designation, department aur reporting manager dikhte hain. Departments page pe department-wise list hai.' },
  { topic: 'Salary / payments', keys: ['salary', 'pay', 'paisa', 'payment', 'advance', 'fine', 'pending pay'],
    a: 'Dashboard ke "Your pending pay" tile mein is mahine ka earned/paid/pending dikhta hai. Salary, advance ya fine ke sawaal admin handle karte hain, neeche WhatsApp button se pooch lo.' },
  { topic: 'Simran', keys: ['simran', 'tum kaun', 'who are you', 'kya kar sakti', 'help', 'madad', 'kaise use', 'app kaise', 'guide', 'features'],
    a: 'Main Simran hoon, Lighthouse ki assistant. Poocho: aaj ke hours, tasks, leaves, score, shift, ya app ke baare mein: "clock in kaise kare", "break kaise le", "leave kaise apply kare", "task accept kaise kare", "score kaise banta hai", "push notification kaise on kare", "password kaise badle". Jo main na bata paun wo "Admin ko WhatsApp karo" se bhej do.' }
];

const GUIDE = FAQ.map(f => `- ${f.topic}: ${f.a}`).join('\n');

/** Best FAQ match for a question, or null. */
function match(q) {
  const t = ' ' + String(q || '').toLowerCase().replace(/[?!.,]/g, ' ') + ' ';
  let best = null, bestScore = 0;
  for (const f of FAQ) {
    let score = 0;
    for (const k of f.keys) if (t.includes(k.startsWith(' ') || k.endsWith(' ') ? k : k)) score += k.length;
    if (score > bestScore) { best = f; bestScore = score; }
  }
  return bestScore >= 3 ? best : null;
}

module.exports = { FAQ, GUIDE, match };
