-- Room display settings (name + icon per room id)
create table rnr.room_settings (
  id text primary key,
  title text not null,
  icon text not null,
  sort_order int not null default 0
);

insert into rnr.room_settings (id, title, icon, sort_order) values
  ('Double1', 'Double 1', '👑', 1),
  ('Double2', 'Double 2', '🌅', 2),
  ('Double3', 'Double 3', '🌿', 3),
  ('Single', 'Single', '🛌', 4),
  ('Sofabed', 'Sofa Bed', '🛋️', 5);

alter table rnr.room_settings enable row level security;
