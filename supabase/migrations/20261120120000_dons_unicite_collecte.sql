-- Un donneur ne peut avoir qu'un seul don par collecte
alter table public."t_Dons"
  drop constraint if exists uq_dons_donneur_collecte;

alter table public."t_Dons"
  add constraint uq_dons_donneur_collecte unique ("IdDonneur", "AnnéeDon", "NumCollecte");
