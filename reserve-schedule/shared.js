/* 予約受付台帳 - 共通ロジック（予約ページ / 管理者ページで共有） */
window.Ledger = (function(){
  "use strict";

  var STORAGE_RESERVATIONS = "reserveLedger.reservations";
  var STORAGE_ICS = "reserveLedger.icsEvents";
  var STORAGE_ICS_FILES = "reserveLedger.icsFileNames";

  /* ---------- Persistence ---------- */
  function loadReservations(){
    try{
      var raw = localStorage.getItem(STORAGE_RESERVATIONS);
      return raw ? JSON.parse(raw) : [];
    }catch(e){ return []; }
  }
  function saveReservations(reservations){
    try{
      localStorage.setItem(STORAGE_RESERVATIONS, JSON.stringify(reservations));
      return true;
    }catch(e){ return false; }
  }
  function loadIcsEvents(){
    try{
      var raw = localStorage.getItem(STORAGE_ICS);
      if(!raw) return [];
      var parsed = JSON.parse(raw);
      return parsed.map(function(e){
        return { start:new Date(e.start), end:new Date(e.end), allDay:!!e.allDay, summary:e.summary };
      });
    }catch(e){ return []; }
  }
  function saveIcsEvents(icsEvents){
    var serializable = icsEvents.map(function(e){
      return { start:e.start.toISOString(), end:e.end.toISOString(), allDay:e.allDay, summary:e.summary };
    });
    try{
      localStorage.setItem(STORAGE_ICS, JSON.stringify(serializable));
      return true;
    }catch(e){ return false; }
  }
  function loadIcsFileNames(){
    try{
      var raw = localStorage.getItem(STORAGE_ICS_FILES);
      return raw ? JSON.parse(raw) : [];
    }catch(e){ return []; }
  }
  function saveIcsFileNames(names){
    try{
      localStorage.setItem(STORAGE_ICS_FILES, JSON.stringify(names));
      return true;
    }catch(e){ return false; }
  }
  function isStorageAvailable(){
    try{
      var testKey = "reserveLedger.__test__";
      localStorage.setItem(testKey, "1");
      localStorage.removeItem(testKey);
      return true;
    }catch(e){ return false; }
  }

  /* ---------- Date helpers ---------- */
  function mondayOf(d){
    var date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var day = date.getDay();
    var diff = (day === 0) ? -6 : (1 - day);
    date.setDate(date.getDate() + diff);
    return date;
  }
  function addDays(d, n){
    var r = new Date(d.getTime());
    r.setDate(r.getDate() + n);
    return r;
  }
  function dateISO(d){
    var y = d.getFullYear();
    var m = String(d.getMonth()+1).padStart(2,"0");
    var day = String(d.getDate()).padStart(2,"0");
    return y + "-" + m + "-" + day;
  }
  function minutesToLabel(min){
    var h = Math.floor(min/60), m = min%60;
    return String(h).padStart(2,"0") + ":" + String(m).padStart(2,"0");
  }
  function fmtMonthDate(d){
    return (d.getMonth()+1) + "/" + d.getDate();
  }
  function fmtFullDate(d){
    var wd = ["日","月","火","水","木","金","土"][d.getDay()];
    return d.getFullYear() + "年" + (d.getMonth()+1) + "月" + d.getDate() + "日(" + wd + ")";
  }
  function fmtCardDate(dISO){
    var d = new Date(dISO + "T00:00:00");
    var wd = ["日","月","火","水","木","金","土"][d.getDay()];
    return (d.getMonth()+1) + "/" + d.getDate() + "(" + wd + ")";
  }

  /* ---------- Reservation / busy lookup ---------- */
  function isBusy(icsEvents, dayDate, startMin, endMin){
    var cellStart = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 0,0,0);
    cellStart.setMinutes(startMin);
    var cellEnd = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 0,0,0);
    cellEnd.setMinutes(endMin);
    for (var i=0;i<icsEvents.length;i++){
      var e = icsEvents[i];
      if (cellStart < e.end && cellEnd > e.start){
        return e.summary;
      }
    }
    return null;
  }
  function findReservation(reservations, dISO, startMin){
    for (var i=0;i<reservations.length;i++){
      var r = reservations[i];
      if (r.dateISO === dISO && r.startMin === startMin) return r;
    }
    return null;
  }
  function normalizeEmail(email){
    return String(email || "").trim().toLowerCase();
  }

  /* ---------- ICS parsing ---------- */
  function parseICS(text){
    var lines = text.split(/\r\n|\n|\r/);
    var unfolded = [];
    for (var i=0;i<lines.length;i++){
      var line = lines[i];
      if ((line.charAt(0) === " " || line.charAt(0) === "\t") && unfolded.length){
        unfolded[unfolded.length-1] += line.slice(1);
      } else {
        unfolded.push(line);
      }
    }
    var events = [];
    var cur = null;
    for (var j=0;j<unfolded.length;j++){
      var raw = unfolded[j];
      if (raw === "BEGIN:VEVENT"){ cur = {}; continue; }
      if (raw === "END:VEVENT"){ if (cur && cur.dtstart) events.push(cur); cur = null; continue; }
      if (!cur) continue;
      var idx = raw.indexOf(":");
      if (idx === -1) continue;
      var left = raw.slice(0, idx);
      var value = raw.slice(idx+1);
      var parts = left.split(";");
      var name = parts[0];
      var isDateOnly = false;
      for (var k=1;k<parts.length;k++){
        if (parts[k].toUpperCase() === "VALUE=DATE"){ isDateOnly = true; }
      }
      if (name === "DTSTART"){
        var ps = parseICSDateTime(value, isDateOnly);
        cur.dtstart = ps.date; cur.allDay = ps.allDay;
      } else if (name === "DTEND"){
        var pe = parseICSDateTime(value, isDateOnly);
        cur.dtend = pe.date;
      } else if (name === "SUMMARY"){
        cur.summary = unescapeICSText(value);
      }
    }
    var out = [];
    for (var x=0;x<events.length;x++){
      var e = events[x];
      if (!e.dtstart) continue;
      var start = e.dtstart, end = e.dtend;
      if (e.allDay){
        if (!end){ end = new Date(start.getTime()); end.setDate(end.getDate()+1); }
      } else if (!end){
        end = new Date(start.getTime() + 60*60*1000);
      }
      out.push({ start:start, end:end, allDay: !!e.allDay, summary: e.summary || "(タイトルなし)" });
    }
    return out;
  }
  function parseICSDateTime(value, isDateOnly){
    value = value.trim();
    if (isDateOnly || /^\d{8}$/.test(value)){
      var y0 = +value.slice(0,4), mo0 = +value.slice(4,6)-1, d0 = +value.slice(6,8);
      return { date: new Date(y0,mo0,d0,0,0,0), allDay:true };
    }
    var m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
    if (!m) return { date:null, allDay:false };
    var y=+m[1], mo=+m[2]-1, d=+m[3], h=+m[4], mi=+m[5], s=+m[6], z=m[7];
    if (z){
      return { date:new Date(Date.UTC(y,mo,d,h,mi,s)), allDay:false };
    }
    return { date:new Date(y,mo,d,h,mi,s), allDay:false };
  }
  function unescapeICSText(v){
    return v.replace(/\\n/gi,"\n").replace(/\\,/g,",").replace(/\\;/g,";").replace(/\\\\/g,"\\");
  }

  /* ---------- Misc ---------- */
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c];
    });
  }

  return {
    loadReservations: loadReservations,
    saveReservations: saveReservations,
    loadIcsEvents: loadIcsEvents,
    saveIcsEvents: saveIcsEvents,
    loadIcsFileNames: loadIcsFileNames,
    saveIcsFileNames: saveIcsFileNames,
    isStorageAvailable: isStorageAvailable,
    mondayOf: mondayOf,
    addDays: addDays,
    dateISO: dateISO,
    minutesToLabel: minutesToLabel,
    fmtMonthDate: fmtMonthDate,
    fmtFullDate: fmtFullDate,
    fmtCardDate: fmtCardDate,
    isBusy: isBusy,
    findReservation: findReservation,
    normalizeEmail: normalizeEmail,
    parseICS: parseICS,
    escapeHtml: escapeHtml
  };
})();
