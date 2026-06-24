-- 已查證種子關係（來源為各該判決）。重複執行前可先清空：
--   delete from relationships; delete from entities; （僅本功能資料）
do $$
declare
  s_chen uuid; s_chenyi uuid; s_sun uuid; s_yun uuid;
  id_wang uuid; id_shen uuid; id_chen uuid; id_chenyi uuid; id_sun uuid;
  e_bai uuid; e_chang uuid; e_li uuid;
begin
  -- 端點 officials（名字＋職別查；查不到就略過該條，避免錯掛）
  select id into id_wang   from officials where name='王又民' and office_type='councilor' limit 1;
  select id into id_shen   from officials where name='沈宗隆' and office_type='councilor' limit 1;
  select id into id_chen   from officials where name='陳重文' and office_type='councilor' limit 1;
  select id into id_chenyi from officials where name='陳怡君' and office_type='councilor' limit 1;
  select id into id_sun    from officials where name='孫韻璇' and office_type='councilor' limit 1;

  -- 外部公眾人物（配偶/前民代）
  insert into entities(name, entity_type, description) values
    ('白惠萍','family_member','臺北市議員陳重文之配偶，貪污案共同被告') returning id into e_bai;
  insert into entities(name, entity_type, description) values
    ('張惠霖','family_member','臺北市議員陳怡君之同居伴侶，貪污案共同被告') returning id into e_chang;
  insert into entities(name, entity_type, description) values
    ('李雲強','other','前桃園縣／市議員，桃園市議員孫韻璇之配偶') returning id into e_li;

  -- 來源（各關係使用其起點議員之判決 URL）
  insert into sources(url,type,title,retrieved_at) values
    ('https://judgment.judicial.gov.tw/FJUD/data.aspx?ty=JD&id=ULDM,113,%E7%9F%9A%E8%A8%B4,1&ot=in','court','雲林地院113年度矚訴字第1號','2026-06-24') returning id into s_sun;
  insert into sources(url,type,title,retrieved_at) values
    ('https://judgment.judicial.gov.tw/FJUD/data.aspx?ty=JD&id=TPDM,113,金訴,32,20241227,3&ot=in','court','臺北地院113年度金訴字第32號','2026-06-24') returning id into s_chen;
  insert into sources(url,type,title,retrieved_at) values
    ('https://judgment.judicial.gov.tw/FJUD/data.aspx?ty=JD&id=SLDM,114,訴,629,20260112,2&ot=in','court','士林地院114年度訴字第629號','2026-06-24') returning id into s_chenyi;
  insert into sources(url,type,title,retrieved_at) values
    ('https://judgment.judicial.gov.tw/FJUD/data.aspx?ty=JD&id=TYDM,111,訴,1159,20240708,1&ot=in','court','桃園地院111年度訴字第1159號','2026-06-24') returning id into s_yun;

  -- 關係（端點都存在才插）
  if id_wang is not null and id_shen is not null then
    insert into relationships(from_type,from_id,to_type,to_id,relation_type,directed,note,source_id)
    values ('official',id_wang,'official',id_shen,'co_case',false,'雲林縣議會貪污案共同被告（113矚訴1）',s_sun);
  end if;
  if id_chen is not null then
    insert into relationships(from_type,from_id,to_type,to_id,relation_type,directed,note,source_id)
    values ('official',id_chen,'entity',e_bai,'spouse',false,'貪污案共同被告',s_chen);
  end if;
  if id_chenyi is not null then
    insert into relationships(from_type,from_id,to_type,to_id,relation_type,directed,note,source_id)
    values ('official',id_chenyi,'entity',e_chang,'relative',false,'同居伴侶、貪污案共同被告',s_chenyi);
  end if;
  if id_sun is not null then
    insert into relationships(from_type,from_id,to_type,to_id,relation_type,directed,note,source_id)
    values ('official',id_sun,'entity',e_li,'spouse',false,'配偶，犯行發生於其夫任議員期間',s_yun);
  end if;
end $$;
