import { createClient } from '@libsql/client';
import fs from 'fs';

async function test() {
  const dbClient = createClient({ url: 'file:./dev.db' });
  
  // get one csv
  const content = fs.readFileSync('client/src/csv/ALL_20260101_20260115_daily_report.csv', 'utf8');
  
  // mock the parsing logic
  const cleanContent = content.replace(/^\uFEFF/, '');
  const lines = cleanContent.split(/\r?\n/).filter((l) => l.trim());
  const parseCsvLine = (line) => {
    const result = [];
    let current = ''; let inQuotes = false;
    for(let i=0; i<line.length; i++){
      const ch = line[i];
      if(ch==='\"') {
        if(inQuotes && line[i+1]==='\"') { current += '\"'; i++; } else inQuotes = !inQuotes;
      } else if(ch===',' && !inQuotes) { result.push(current); current = ''; } else current += ch;
    }
    result.push(current); return result;
  };
  const headers = parseCsvLine(lines[0]).map(h => h.trim().replace(/^\"|\"$/g, '').toLowerCase());
  const getCol = (row, name) => { const idx = headers.indexOf(name); if(idx===-1)return ''; return (row[idx]||'').trim().replace(/^\"|\"$/g, ''); };
  const toNum = (s) => { const n = parseFloat(s.replace(/,/g, '')); return isNaN(n)?0:n; };

  const rows = [];
  for(let i=1; i<lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const dateStr = getCol(row, 'date');
    if(!dateStr) continue;
    let normalizedDate = dateStr;
    if(dateStr.length===8 && !dateStr.includes('-')) normalizedDate = dateStr.slice(0,4)+'-'+dateStr.slice(4,6)+'-'+dateStr.slice(6,8);
    const testDate = new Date(normalizedDate + 'T00:00:00Z');
    if(isNaN(testDate.getTime())) continue;
    
    rows.push({
      date: testDate.getTime(), // manual mock of how drizzle maps it
      year: parseInt(getCol(row, 'year')) || testDate.getFullYear(),
      month: parseInt(getCol(row, 'month')) || testDate.getMonth()+1,
      day: parseInt(getCol(row, 'day')) || testDate.getDate(),
      app: getCol(row, 'app').toLowerCase(),
      adpf: getCol(row, 'adpf'),
      adnetwork1: getCol(row, 'adnetwork1'),
      adnetwork2: getCol(row, 'adnetwork2'),
      unitId: getCol(row, 'unit_id') || getCol(row, 'unitid'),
      unitName: getCol(row, 'unit_name') || getCol(row, 'unitname'),
      creativeType: getCol(row, 'creative_type') || getCol(row, 'creativetype'),
      place1: getCol(row, 'place1'),
      place2: getCol(row, 'place2'),
      place3: getCol(row, 'place3'),
      requests: toNum(getCol(row, 'requests')),
      fills: toNum(getCol(row, 'fills')),
      impressions: toNum(getCol(row, 'impressions')),
      clicks: toNum(getCol(row, 'clicks')),
      estimatedRevenue: toNum(getCol(row, 'estimated revenue') || getCol(row, 'estimatedrevenue')),
      confirmedRevenue: toNum(getCol(row, 'confirmed revenue') || getCol(row, 'confirmedrevenue')),
      currency: getCol(row, 'currency'),
    });
  }
  console.log('Parsed rows:', rows.length);
  if(rows.length===0) return;
  
  // try inserting purely using libSql batch client logic
  const keys = ['date', 'year', 'month', 'day', 'app', 'adpf', 'adnetwork1', 'adnetwork2', 'unitId', 'unitName', 'creativeType', 'place1', 'place2', 'place3', 'requests', 'fills', 'impressions', 'clicks', 'estimatedRevenue', 'confirmedRevenue', 'currency'];
  const placeholders = keys.map(()=>'?').join(',');
  const query = `INSERT INTO ad_stats (${keys.map(k=>`"${k}"`).join(',')}) VALUES (${placeholders})`;
  
  try {
    const first500 = rows.slice(0, 500);
    const argsMulti = [];
    first500.forEach(r => argsMulti.push(keys.map(k => r[k])));
    console.log('Sending transaction for CHUNK 0..500');
    await dbClient.batch(argsMulti.map(args => ({ sql: query, args })));
    console.log('SUCCESS INSERT');
  } catch(e) {
    console.error('ERROR during driver batch:', e);
  }
}
test();
