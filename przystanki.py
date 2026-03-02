import warsaw_data_api

ztm = warsaw_data_api.ztm(apikey='a7744a4c-b805-411f-a838-85ed62e40f4d') # you can get API KEY on the https://api.um.warszawa.pl/ after you register
schedule = ztm.get_bus_stop_schedule_by_id("6089", "03", "221")
print(schedule.rides)