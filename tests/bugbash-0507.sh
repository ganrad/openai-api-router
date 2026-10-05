i=1
appname="ai-gk-chatbot"
token="mF6dXJlLmNvbSIsImlzcyI6Imh0dHBzOi8vc3RzLndpbmRvd3MubmV0LzE2YjNjMDEzLWQzMDAtNDY4ZC1hYzY0LTdlZGEwODIwYjZkMy8iLCJpYXQiOjE3NzgxODU0MjYsIm5iZiI6MTc3ODE4NTQyNiwiZXhwIjoxNzc4MTkwMjczLCJhY3IiOiIxIiwiYWlvIjoiQWZRQUMvOGNBQUFBZVY0UmpBcVROSkxqRUtwYjloTjFsTm9aLy9FWkMvMTNvVEpvQ0FmUllOeitxd1hjQ0UyM2FHaGk2d0sycE1nVzQzek5mQTQzTHAvTG5rWHh2dytSTGtUVHBKTmJncHU3RUsxbTdZaTlrNTV6aHJVOEd5OVQySHF6WkkrcGt2MTRPWW5CNWZ6MDhIL0gyaG02NG9ZenJnZ2lzbW8wMkIxKzl3RHpralE3WmlUWFh5NFJxb0xpY1RXSTl2QXpKZHhuNEs1M2Y5Q3JQdFNEUFJreEZPSXAxSThxeTZNV3NtNGI3YVlqQ2Fld3BZMXNmYm1qZWdsQllGYWw4NXd5VDJsTGRTd2Z5L0xyaWdpVW16cXZCT0dwUDdQQ0V3Y1dCUnpTS1UzY0wrMWlWVFVyVEZwTGRQSi9iZEpkTm9wZXZzWFkiLCJhbHRzZWNpZCI6IjU6OjEwMDMyMDAzMDk4RjFDMkUiLCJhbXIiOlsiZmlkbyIsInJzYSIsIm1mYSJdLCJhcHBpZCI6IjA0YjA3Nzk1LThkZGItNDYxYS1iYmVlLTAyZjllMWJmN2I0NiIsImFwcGlkYWNyIjoiMCIsImRldmljZWlkIjoiMWY4Y2I2YmYtYzZlNi00ZTJkLWJmNDktZGQzNDljMGViZTFkIiwiZW1haWwiOiJnYW5lc2hyYUBtaWNyb3NvZnQuY29tIiwiZmFtaWx5X25hbWUiOiJSYWRoYWtyaXNobmFuIiwiZ2l2ZW5fbmFtZSI6IkdhbmVzaCIsImdyb3VwcyI6WyI0NjIzMDkwYi02YjA4LTQ2NWQtODdjYi01NGQwN2RkNjM5ZWQiLCJmOTQ1ZjcxMi1jMWRhLTRiMWItOTRlMy0wZGQ3ZTczMDE1ZjgiLCJmZWUzYjkxMy03MDRjLTRlNGMtYjMxMy0yZTkwNWZkMzZlNGMiLCJiMTMwNDAyMi0wOGU2LTQ0N2QtYjA5NC0xNTM3MDU5N2M2YjYiLCI3NDVlMDQ2NS1lM2FkLTQ5NWYtOGQ2NS01ZThkZWMzNDNkZmEiLCIwOTUzMWE3Mi0yYzNlLTRlMDYtYmUxZS0yNTk2YmQwOGRjZGQiLCJiNDI1NDhhYS05ZjQ1LTRhMzQtODFiMC1kYjFiMWI0YTM0NzgiLCJkMzRjNGViZS00OTg0LTQ5MDMtYTY0ZC04YzIwMjgzZDUxNmIiLCJiNTJmMjBjYS1kYWJmLTQyMmUtOThlZS1mMDhmMDEwODE3MTYiLCJlMzA5NmRmNy1iNjVjLTRlMzItYWIxYS03YTM1ZGM2ODRmMGEiXSwiaWRwIjoiaHR0cHM6Ly9zdHMud2luZG93cy5uZXQvNzJmOTg4YmYtODZmMS00MWFmLTkxYWItMmQ3Y2QwMTFkYjQ3LyIsImlkdHlwIjoidXNlciIsImlwYWRkciI6IjQuMjQyLjE2LjE4MSIsIm5hbWUiOiJHYW5lc2ggUmFkaGFrcmlzaG5hbiIsIm9pZCI6IjdmMmVmYWEyLWExNDUtNDM2NC1hY2YxLTQ0YjY0YmVhNmQ1ZSIsInB1aWQiOiIxMDAzMjAwMzEwRUNEODUwIiwicmgiOiIxLkFVWUFFOEN6RmdEVGpVYXNaSDdhQ0NDMjAxOXZwaGpmMnhkTW5kY1dOSEVxbkw0QUFMeEdBQS4iLCJzY3AiOiJ1c2VyX2ltcGVyc29uYXRpb24iLCJzaWQiOiIwMDJmN2M1YS01ZDVmLWYzMjktODAyMy01ZWRmOGY5YWFiOWMiLCJzdWIiOiJqaHVLUHdLbHlTRm9GTUcyb2REVjdOcVl3MkZsMVpycVpQMldsOWdYV2pVIiwidGlkIjoiMTZiM2MwMTMtZDMwMC00NjhkLWFjNjQtN2VkYTA4MjBiNmQzIiwidW5pcXVlX25hbWUiOiJnYW5lc2hyYUBtaWNyb3NvZnQuY29tIiwidXRpIjoiRUV1aUpkazBYRUNvQUJHQlAwSU5BQSIsInZlciI6IjEuMCIsInhtc19hY3RfZmN0IjoiMyA1IiwieG1zX2Z0ZCI6IlZCcTBBeU9QV3IzSHd1SXhzZFJXRl9JMy00OVN6RHJtdFN6V2hCZENTcVFCZFhOemIzVjBhQzFrYzIxeiIsInhtc19pZHJlbCI6IjEgMjIiLCJ4bXNfc3ViX2ZjdCI6IjEyIDMifQ.WBj_5kdEUG4jrbuRc1kO0yrKnQN8qz3Ne9Q9hUJl9wK1jU6bQrtelwRoeRPUiXvmPooMuM7XVyE43dEWHrMyBsV5qF75uzgV3k2CKujkzYyOpGI33VHJwRAyT_DSOacJZleE7eAdIYgp-htt9Ho2POt12p8BlFf-blWlNnuJNlKp7esnvr6UaKOMY9I9YqGY529FmU6qDzbfcF08HzHuVjADowDkFTHg2lenQbCf7R0hhC6ADrNiRWAiB7RQgdPwg1qTOKkLABk6uHuXC_5Ra6qqX8prsodFNjoqxPe47dJeTJpW_sCSMbb3zrGWplH6GmNYocEEgCFDgvwY5qBWew"
while [ $i -le 100 ]
do
  curl http://$1:$2/api/v1/test/aigateway/lb/$appname \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    --data @chat-bot-data-direct.json | jq . 
  curl http://$1:$2/api/v1/test/aigateway/lb/$appname?use_cache=false \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    --data @chat-bot-data-01.json | jq . 
  curl http://$1:$2/api/v1/test/aigateway/lb/$appname \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    --data @chat-bot-data-02.json | jq . 
  curl http://$1:$2/api/v1/test/aigateway/lb/$appname?use_cache=false \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    --data @chat-bot-data-03.json | jq . 
  curl http://$1:$2/api/v1/test/aigateway/lb/$appname \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    --data @chat-bot-data-04.json | jq . 
  curl http://$1:$2/api/v1/test/aigateway/lb/$appname?use_cache=false \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    --data @chat-bot-data-05.json | jq . 
  curl http://$1:$2/api/v1/test/aigateway/lb/$appname \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    --data @chat-bot-data-06.json | jq . 
  curl http://$1:$2/api/v1/test/aigateway/lb/$appname?use_cache=false \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    --data @chat-bot-data-07.json | jq . 
  curl http://$1:$2/api/v1/test/aigateway/lb/$appname \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    --data @chat-bot-data-08.json | jq . 
  curl http://$1:$2/api/v1/test/aigateway/lb/$appname \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    --data @chat-bot-data-09.json | jq . 
  curl http://$1:$2/api/v1/test/aigateway/lb/$appname \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    --data @chat-bot-data-10.json | jq . 
  curl http://$1:$2/api/v1/test/aigateway/lb/$appname \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    --data @chat-bot-data-11.json | jq . 
  curl http://$1:$2/api/v1/test/aigateway/lb/$appname \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    --data @chat-bot-data-12.json | jq . 
  curl http://$1:$2/api/v1/test/aigateway/lb/$appname \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    --data @chat-bot-data-13.json | jq . 
  curl http://$1:$2/api/v1/test/aigateway/lb/$appname \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    --data @chat-bot-data-14.json | jq . 
  curl http://$1:$2/api/v1/test/aigateway/lb/$appname \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $token" \
    --data @chat-bot-data-15.json | jq . 

  ((i++))
  sleep 2
done
