import { describe, it, expect } from 'vitest';
import { compareRegions, compareElectionNames, orderPartyOptions, partiesBySeats } from '../src/lib/filterOptions';
import { matchRecipient, collectParties, collectElectionGroups, type Recipient } from '../src/lib/donorFilter';
import { queryList } from '../src/lib/filterSort';
import type { OfficialListRow } from '../src/lib/types';

describe('shared filter options', () => {
  it('orders counties geographically, then islands and other regions', () => {
    expect(['其他','金門縣','高雄市','臺北市','基隆市','花蓮縣','新北市'].sort(compareRegions))
      .toEqual(['基隆市','臺北市','新北市','高雄市','花蓮縣','金門縣','其他']);
  });
  it('orders election years newest first, then county and office, without assigning a year to undated by-elections', () => {
    const elections = ['第4屆臺中市議員補選','111年臺北市議員選舉','111年高雄市市長選舉','2024年立法委員選舉','111年臺北市市長選舉','113年立法委員選舉'];
    expect(elections.sort(compareElectionNames).slice(2))
      .toEqual(['111年臺北市市長選舉','111年臺北市議員選舉','111年高雄市市長選舉','第4屆臺中市議員補選']);
    expect(['111年嘉義縣朴子市市長選舉','111年嘉義縣議員選舉','111年嘉義縣縣長選舉'].sort(compareElectionNames))
      .toEqual(['111年嘉義縣縣長選舉','111年嘉義縣議員選舉','111年嘉義縣朴子市市長選舉']);
  });
  it('keeps the full-roster seat order when a page has only a subset or repeated records', () => {
    const official = (id: string, party: string, departed = false) => ({id,party,departed,officeType:'councilor'});
    const order = partiesBySeats([official('a','國民黨'),official('a','中國國民黨'),official('b','民進黨'),official('c','民主進步黨'),official('d','國民黨',true)]);
    expect(order).toEqual(['民進黨','國民黨']);
    expect(orderPartyOptions(['中國國民黨','國民黨','民主進步黨','新政黨'],order)).toEqual(['民進黨','國民黨','新政黨']);
  });
  it('merged party options still match full names in roster and donor filters', () => {
    const row = {id:'a',party:'民主進步黨'} as OfficialListRow;
    expect(queryList([row],{party:'民進黨'})).toEqual([row]);
    const recipient: Recipient = {name:'甲',slug:'a',party:'民主進步黨',officeType:'councilor',election:'111年臺北市議員選舉',amount:10};
    expect(matchRecipient(recipient,{party:'民進黨'})).toBe(true);
    expect(collectParties([{uid:'a',name:'公司',total:20,recipients:[recipient,{...recipient,party:'民進黨'}]}])).toEqual(['民進黨']);
    expect(matchRecipient({...recipient,slug:null},{party:'民進黨'})).toBe(false);
    expect(collectElectionGroups([{uid:'a',name:'公司',total:20,recipients:[recipient,{...recipient,election:'111年臺北市市長選舉'}]}])).toEqual(['縣市長選舉','議員選舉']);
  });
});
