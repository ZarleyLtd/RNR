-- Reset test bookings after room model change (Master/Twin/Bunk -> 5 units)
truncate table rnr.bookings restart identity;
truncate table rnr.activity_log restart identity;
