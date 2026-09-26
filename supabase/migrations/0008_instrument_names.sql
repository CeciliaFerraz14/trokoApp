-- =============================================================================
-- Troko Bloco · Migración 0008 · Nombres de instrumentos
-- La lista del perfil pasa a: Fondo 1, Fondo 2, Surdo 3, Repique, Caja, Timbau.
-- Renombra los que ya estaban guardados con los nombres anteriores (y quita
-- duplicados si alguien tenía dos que ahora se llaman igual).
-- =============================================================================
update public.profiles p
set instruments = (
  -- Mismo orden que tenía la persona; si dos pasan a llamarse igual, queda uno
  select coalesce(array_agg(t.name order by t.pos), '{}')
  from (
    select n.name, min(i.pos) as pos
    from unnest(p.instruments) with ordinality as i(old, pos)
    cross join lateral (
      select case i.old
        when 'Surdo de primera' then 'Fondo 1'
        when 'Surdo de segunda' then 'Fondo 2'
        when 'Surdo de tercera' then 'Surdo 3'
        when 'Repinique'        then 'Repique'
        when 'Caixa'            then 'Caja'
        when 'Timbal'           then 'Timbau'
        else i.old
      end as name
    ) n
    group by n.name
  ) t
)
where p.instruments && array['Surdo de primera', 'Surdo de segunda', 'Surdo de tercera', 'Repinique', 'Caixa', 'Timbal'];
