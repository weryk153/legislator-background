import { describe, expect, it } from 'vitest';
import { buildRankingPeople, DEFAULT_RANKING_QUERY, queryRankings, rankingQueryFromParams, rankingPeriods, rankingParties } from '../src/lib/rankings';
import type { GraphData, Official, Source } from '../src/lib/types';
const source: Source = { id:'s', url:'https://example.com', type:'gov', title:'來源', retrievedAt:'2026-10-21' };
const official = (id: string, more: Partial<Official> = {}): Official => ({ id, slug:id, name:id, party:'無黨籍', officeType:'councilor', district:'臺北市第1選區', term:'', bio:'', isIncumbent:true, departedReason:null, photoUrl:null, careers:[], judgments:[], controversies:[], donations:[], assets:[], ...more });
const graph: GraphData = {nodes:[],edges:[]};
const asset = (year:number, amount:number) => ({ id:String(year), year, source, items:[{category:'deposit' as const, amount, label:null}] });
const report = (electionName:string, more = {}) => ({id:electionName,electionName,reportSeq:'首次申報',totalIncome:100,totalExpense:50,incomeByType:{'營利事業捐贈收入':25},expenseByType:{},topDonors:[],source,...more});

describe('ranking comparability', () => {
  it('orders parties by incumbent seats, merges aliases, and excludes candidates and departed officials from seat counts', () => {
    const people = buildRankingPeople([
      official('a', {party:'中國國民黨'}), official('b', {party:'國民黨'}),
      official('c', {party:'民主進步黨', assets:[asset(2026,10)]}),
      official('d', {party:'民進黨', officeType:'candidate', assets:[asset(2026,20)]}),
      official('e', {party:'民進黨', isIncumbent:false}),
      official('f', {party:'民進黨', departedReason:'離任'}),
      official('g', {party:'台灣民眾黨', officeType:'candidate'}),
      official('h', {party:'無黨籍及未經政黨推薦', officeType:'candidate'}),
      official('i', {party:'無黨籍', officeType:'candidate'}),
    ], graph);
    const parties = rankingParties(people);
    expect(parties.slice(0,2)).toEqual(['國民黨','民進黨']);
    expect(parties).toHaveLength(4);
    expect(parties).toContain('無黨籍');
    expect(queryRankings(people,{...DEFAULT_RANKING_QUERY,party:'民進黨'}).rows).toHaveLength(2);
    expect(rankingQueryFromParams(new URLSearchParams('party=民主進步黨'),people).party).toBe('民進黨');
  });
  it('distinguishes missing values from explicit zero and uses latest declaration without backfilling', () => {
    const people=buildRankingPeople([
      official('missing'),official('zero',{assets:[asset(2026,0)]}),
      official('older',{assets:[asset(2025,500), {id:'new',year:2026,source,items:[]}]}),
    ],graph);
    expect(queryRankings(people,DEFAULT_RANKING_QUERY)).toMatchObject({scopeCount:3,eligibleCount:1,excludedCount:2,rows:[{name:'zero',value:0}]});
    expect(queryRankings(people,{...DEFAULT_RANKING_QUERY,period:'2025'}).rows).toMatchObject([{name:'older',value:500}]);
  });
  it('never interprets land value as parcel count or counts as monetary amounts', () => {
    const people=buildRankingPeople([official('a',{assets:[{id:'a',year:2026,source,items:[
      {category:'land',amount:900000,label:null},{category:'building',amount:2,label:'count'},
      {category:'deposit',amount:3,label:'count'},
    ]}]})],graph);
    expect(people[0].assets[0].values).toMatchObject({land:null,building:2,deposit:null});
  });
  it('compares only the selected election, does not sum report revisions, and uses income categories', () => {
    const people=buildRankingPeople([
      official('a',{donations:[report('111年選舉'),report('113年選舉',{totalIncome:1000})]}),
      official('duplicate',{donations:[report('111年選舉'),report('111年選舉',{reportSeq:'更正'})]}),
      official('unknown',{donations:[report('111年選舉',{incomeByType:{}})]}),
    ],graph);
    expect(queryRankings(people,{...DEFAULT_RANKING_QUERY,metric:'corporateShare',period:'111年選舉'}).rows).toMatchObject([{name:'a',value:25}]);
    expect(queryRankings(people,{...DEFAULT_RANKING_QUERY,metric:'income',period:'113年選舉'}).rows).toMatchObject([{name:'a',value:1000}]);
  });
  it('excludes zero denominator, invalid amounts and party-list personal accounts', () => {
    const people=buildRankingPeople([
      official('zero',{donations:[report('e',{totalIncome:0})]}),
      official('invalid',{assets:[asset(2026,NaN)], donations:[report('e',{totalIncome:-1})]}),
      official('partylist',{officeType:'legislator',district:'全國不分區',donations:[report('e')]}),
    ],graph);
    expect(queryRankings(people,{...DEFAULT_RANKING_QUERY,metric:'corporateShare',period:'e'}).rows).toEqual([]);
    expect(queryRankings(people,DEFAULT_RANKING_QUERY).rows).toEqual([]);
  });
  it('assigns competition ranks, keeps ranks during name search, recalculates after scope filters', () => {
    const people=buildRankingPeople([
      official('甲',{assets:[asset(2026,100)]}),official('乙',{assets:[asset(2026,100)]}),
      official('戴瑋姍',{party:'其他',assets:[asset(2026,50)]}),
    ],graph);
    expect(queryRankings(people,DEFAULT_RANKING_QUERY).rows.map(r=>r.rank)).toEqual([1,1,3]);
    expect(queryRankings(people,{...DEFAULT_RANKING_QUERY,search:'戴瑋姗'}).rows[0].rank).toBe(3);
    expect(queryRankings(people,{...DEFAULT_RANKING_QUERY,party:'其他'}).rows[0].rank).toBe(1);
    expect(queryRankings(people,{...DEFAULT_RANKING_QUERY,order:'asc'}).rows.map(r=>r.rank)).toEqual([1,2,2]);
  });
  it('counts distinct, sourced graph neighbors and ignores self/dangling edges', () => {
    const edge=(source:string,target:string,sourceUrl='https://example.com')=>({id:source+target,source,target,type:'relative' as const,directed:false,note:null,sourceUrl});
    const g: GraphData={nodes:[{key:'official:a',name:'a',kind:'official',subtype:'councilor'},{key:'entity:b',name:'b',kind:'entity',subtype:'other'}],edges:[edge('official:a','entity:b'),edge('entity:b','official:a'),edge('official:a','official:a'),edge('official:a','entity:missing')]};
    expect(buildRankingPeople([official('a')],g)[0].connections).toBe(1);
    expect(buildRankingPeople([official('a')],{...g,edges:[edge('official:a','entity:b','') ]})[0].connections).toBeNull();
  });
  it('separates final judgments and does not infer a clean record from missing data', () => {
    const judgment=(isFinal:boolean)=>({id:String(isFinal),caseReason:'',court:'',caseNumber:'',outcome:'',isFinal,judgmentDate:'',judgmentUrl:source.url,source});
    const p=buildRankingPeople([official('a',{judgments:[judgment(true),judgment(false)]}),official('b')],graph);
    expect(p[0]).toMatchObject({judgments:2,finalJudgments:1});
    expect(p[1]).toMatchObject({judgments:null,finalJudgments:null});
  });
  it('validates shared query parameters and lists years newest first', () => {
    const p=buildRankingPeople([official('a',{assets:[asset(2020,10),asset(2026,20)]})],graph);
    expect(rankingPeriods(p,'deposit')).toEqual(['latest','2026','2020']);
    expect(rankingQueryFromParams(new URLSearchParams('metric=bad&period=bad&office=bad&order=bad'),p)).toEqual(DEFAULT_RANKING_QUERY);
  });
});
