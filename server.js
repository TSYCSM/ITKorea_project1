var express = require("express"); 
var static = require("serve-static");
var http = require("http");
var fs = require("fs");
var ejs = require("ejs");//new
var common = require("./common.js");//msg와 url을 등록하는 함수 가져오기
var mysql = require("mysql");
var app = express();
var url = require("url"); 

let con;



//DB연동
let conStr={
    url:"localhost",
    user:"test",
    password:"test",
    database:"test"
};


//로그인 할때 select되는 record값을 json에 넣어 세션 인증
var userJson= {
	member_id: 0,
	id: "",
	password : "",
	eamil: "",
	regdate: ""
};

//로그아웃 할때 userJson을 emptyJson으로 바꿔줌
var emptyJson= {
	member_id: 0,
	id: "",
	password : "",
	eamil: "",
	regdate: ""
};

function connect(){
	con = mysql.createConnection(conStr);
	console.log("connected...");
}

//static 파일담은 경로 지정
app.use(static(__dirname + "/static"));

//parsing할때 nested 형태로 extend함
//ex) { person: { name: cw } } 형태로 파싱 가능
app.use(express.urlencoded({
	extended: true,
}));

//홈 주소 index로 변경
app.get("/index", function(request, response){

	var sql = "select count(*) as cnt from member";//cnt 명의 이야기

	con.query(sql, function(error, count, fields){
		if(error){
			console.log("총 member 수 sql 실패", error);
		}else{
			var sql =  "SELECT *, dense_rank() over(order by hit desc) AS ranking FROM poem";//조회수로 상위 5위 poem 게시

			con.query(sql, function(error, row, fields){
				if(error){
					console.log("poem rank() sql문 실패", error);
				}else{
					var sql = "SELECT *, dense_rank() over(order by hit desc) AS ranking FROM story";////조회수로 상위 5위 story 게시
				
					con.query(sql, function(error, record, fields){
						if(error){
							console.log("story rank() sql문 실패", error);
						}else{
							fs.readFile("./index.ejs", "utf-8", function(error, data){
								if(error){
									console.log("index.ejs reading error : ", error);
								}else{
									response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
									response.end(ejs.render(data, {
										sessionId : userJson.id,//네비게이션 우측의 버튼을 (로그인/로그아웃)상태를 나타낼 data
										memberTotal : count[0],
										poemArray : row,
										storyArray : record
									}));
								}
							});
						}
					})
				}
			})
		}
	});


});

//member/regist : 회원가입 기능 추가 (닉네임 추가)
app.post("/member/regist", function(request, response){
	var id = request.body.regist_id;
	var password = request.body.regist_pass;
	var repassword = request.body.regist_repass;
	var nickname = request.body.regist_nickname;
	var email = request.body.regist_email + "@" + request.body.regist_emailAdd;
	var genre_id = request.body.genre_id;
	
	var sql = "select * from member where id = '" + id + "'";//아이디 중복 체크
	con.query(sql, function(error, record, fields){
		if(error){
			console.log("ID double check error : ", error);
		}else{
			var n = record.length;

			if(n > 0){
				//아쉬운 점: ID가 중복되면 아예 모든 정보가 지워진다. 중복검사버튼이 필요
				response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
				response.end(common.getMsgURL("ID is duplicated", "/index#sign"));//중복되면 index#sign부분으로 전환
			}else{
				sql = "INSERT INTO member (id, password, email, nickname) VALUES (?, ?, ?, ?)";//중복이 아니면 insert로 회원등록
				con.query(sql, [id, password, email, nickname], function(error, fields){
					if(error){
						console.log("failed member regist ", error);
					}else{
						sql="select last_insert_id() as member_id";//마지막으로 등록된 사람의 pk가져오기
						con.query(sql, function(error, record, fields){
				
							if(error){
								console.log("pk가져오기 실패", error);
							}else{
								var member_id = record[0].member_id;
								
								for(var i = 0; i<genre_id.length; i++){
									var n = 0;
									//member의 pk와 장르번호를 member_genre에 insert -> member_id에 genre를 넣으면 중복되는 값이 많아 테이블을 분할하여 따로 저장
									sql="insert into member_genre(member_id, genre_id) values("+member_id+" , "+genre_id[i]+")"; 
									//쿼리 실행
									con.query(sql, function(err){
										if(err){
											alert("회원정보 등록 실패");
										}else{
											//마지막 genre_id일때만 response.end 호출 왜? getMsgURL 함수가 insert 한 건당 location.href를 호출해서 에러가 남
											n++;
											if(n == genre_id.length){
												response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
												response.end(common.getMsgURL("회원가입완료", "/index#sign"));
											}
										}
									});
								}
							}
						});
					}
				});
			}
		}
	});
});

//member/login : 로그인 기능 추가. session 필요
//(로그인이 되었을 때, 로그인 버튼이 로그아웃으로 변한다던지 등등...)
//세션 주는 것을 찾아보니 복잡하고 새로운 모듈을 익혀야 되어서 일단 index_loggin.ejs를 만들어서
//로그인 시 로그인/회원가입이 없는 새로운 ejs로 전환시킴....(6일차)
app.post("/member/login", function(request, response){
	var id = request.body.login_id;
	var password = request.body.login_pass;
	var sql = "SELECT member_id, id, password, email, nickname, date_format(regdate, '%Y-%m-%d-%H:%i') regdate FROM member WHERE id=? AND password=?";
	con.query(sql, [id, password], function(error, rows, fields){
		if(error){
			console.log("failed member login ", error);
		}else{
			if(rows == 0){
				response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
				response.end(common.getMsgURL("로그인실패", "/index#login"));
			}else{
				userJson = rows[0];
				response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
				response.end(common.getMsgURL("로그인완료", "/index"));
			}
		}
	});
});

//로그아웃 index.ejs 페이지로  다시 전환해줌
app.get("/index_loggout", function(request, response){
	fs.readFile("./index.ejs", "utf-8", function(error, data){
		if(error){
			console.log("index.ejs reading error : ", error);
		}else{
			userJson = emptyJson;
			response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
			response.end(common.getMsgURL("로그아웃", "/index"));

		}
	});
});


//로그인 상태에서 (마이페이지)
app.get("/mypage", function(request, response){
	fs.readFile("./mypage.ejs", "utf-8", function(error, data){
		if(error){
			console.log("mypage.ejs reading error : ", error);
		}else{
			response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
			response.end(ejs.render(data, {
				sessionId : userJson.id,
				userInfo : userJson
			}));

		}
	});
});

//회원 정보  update (마이페이지)
app.post("/mypage_update", function(request, response){
	var member_id = parseInt(request.body.member_id);
	var password = request.body.password;
	var repassword = request.body.repassword;
	var nickname = request.body.nickname;

	if(password != repassword){
		response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
		response.end(common.getMsgURL("두 비밀번호가 일치하지 않습니다.", "/mypage"));
	}else{
		var sql = "update member set password = ?, nickname =? where member_id = ?";
		con.query(sql, [password, nickname, member_id], function(error, record, fields){
			if(error){
				console.log("회원정보 수정 실패", error);
			}else{
				//회원정보가 갱신되면 바뀌어진 정보를 userJson에 넣어준다. ->세션 갱신
				userJson.password = password;
				userJson.nickname = nickname;
				response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
				response.end(common.getMsgURL("회원정보 수정 성공", "/mypage"));	
			}
		})
	}
});

//모든 회원 정보를 볼 수 있는 adminpage
app.get("/adminpage", function(request, response){
	var sql = "SELECT member_id, id, password, email, nickname, date_format(regdate, '%Y-%m-%d-%H:%i') regdate FROM member order by member_id desc";

	con.query(sql, function(error, record, fields){
		if(error){
			console.log("sql error", error);
		}else{
			fs.readFile("./adminpage.ejs", "utf-8", function(err, data){
				if(err){
					console.log("adminpage ejs reading error", err);
				}else{
					response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
					response.end(ejs.render(data, {
						loginState : "로그아웃",
						sessionId : userJson.id,
						memberArray:record
					}))
				}
			})
		}
	});
});

//작품, 이야기 글 쓰기 폼
app.get("/write", function(request, response){
	fs.readFile("./writeForm.ejs", "utf-8", function(error, data){
		if(error){
			console.log("writeForm.ejs reading error : ", error);
		}else{
			if(userJson.id == ""){
				var tag = "<script>alert('로그인을 먼저 해주세요');location.href='/index#sign';</script>"
				response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
				response.end(tag);
			}else{
				response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
				response.end(ejs.render(data, {
					sessionId : userJson.id
				}));
			}
		}
	});
});

//아이디찾기 폼
app.get("/findId", function(request, response){
	fs.readFile("./findId.ejs", "utf-8", function(error, data){
		if(error){
			console.log("findId.ejs reading error : ", error);
		}else{
			response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
			response.end(ejs.render(data, {
				sessionId : userJson.id,
				userInfo : userJson
			}));

		}
	});
});

//아이디 찾기 로직
app.post("/findId_do", function(request, response){
	var email = request.body.email;

	var sql = "select * from member where email = '"+email+"'";

	con.query(sql, function(error, record, fields){
		if(error){
			console.log("이메일을 통한 아이디 조회 실패", error);
		}else{
			fs.readFile("./findIdView.ejs", "utf-8", function(error, data){
				if(error){
					console.log("findIdView.ejs reading error : ", error);
				}else{
					var result = false;
					console.log("record", record);
					if(record[0] != null){
						result = true;
						
					}
					response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
					response.end(ejs.render(data, {
						sessionId : userJson.id,
						userInfo : userJson,
						tmpIdArray : record,
						flag : result
					}));
				}
			});
		}
	});

});

//글쓰기 후 board_poem가기
app.post("/poemdo", function(request, response){
	var title = request.body.title;
	var writer = userJson.id;
	var content = request.body.content;

	var sql = "insert into poem(title, writer, content) values(?, ?, ?)";

	con.query(sql, [title, writer, content], function(error, fields){
		if(error){
			console.log("글 쓰기 실패", error);
		}else{
			response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
			response.end(common.getMsgURL("글 쓰기 등록", "/board_poem"));
		}
	});
});

//board_poem에서 등록된 poem 불러오기
app.get("/board_poem", function(request, response){
	var sql = "SELECT * from poem order by poem_id desc";
	
	con.query(sql, function(error, record, fields){
		if(error){
			console.log("시 목록 불러오기 실패 ", error);
		}else{
			fs.readFile("board_poem.ejs", "utf-8", function(error, data){
				response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
				response.end(ejs.render(data, {
					poemArray: record
					, sessionId: userJson.id
				}));
			});
		}
	});
});

//detail_poem(목록에서 시 상세보기)으로 가기
app.get("/detail_poem", function(request, response){
	var poem_id = request.query.poem_id;

	var sql = "update poem set hit = hit+1 where poem_id = "+poem_id;//1)조회수 올리고
	
	
	con.query(sql, function(error, fields){
		if(error){
			console.log("조회수 올리기 실패", error);
		}else{
			sql = "select * from poem where poem_id ="+poem_id;//2)작품 한건 페이지에 불러오기
			
			con.query(sql, function(error, record, fields){
				fs.readFile("detail_poem.ejs", "utf-8", function(error ,data){
					if(error){
						console.log("시 상세 ejs 불러오기 실패", error);
					}else{
						response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
						response.end(ejs.render(data, {
							poem: record[0]
							, sessionId : userJson.id
						}));
					}
				});

			})

		}
	})
});

//글쓰기 후 board_story가기 (3일차)
app.post("/storydo", function(request, response){
	var title = request.body.title;
	var writer = userJson.id;
	var content = request.body.content;

	var sql = "insert into story(title, writer, content) values(?, ?, ?)";

	con.query(sql, [title, writer, content], function(error, fields){
		if(error){
			console.log("글 쓰기 실패", error);
		}else{
			response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
			response.end(common.getMsgURL("글 쓰기 등록", "/board_story"));
		}
	});
});

//board_story에서 등록된 story 불러오기 (3일차)
app.get("/board_story", function(request, response){
	var sql = "SELECT * from story order by story_id desc";
	
	con.query(sql, function(error, record, fields){
		if(error){
			console.log("시 목록 불러오기 실패 ", error);
		}else{
			fs.readFile("board_story.ejs", "utf-8", function(error, data){
				response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
				response.end(ejs.render(data, {
					storyArray: record
					, sessionId: userJson.id
				}));
			});
		}
	});
});

//detail_story(목록에서 시 상세보기)으로 가기
app.get("/detail_story", function(request, response){
	var story_id = request.query.story_id;
	var flag = Boolean(request.query.flag);//상세보기 or 댓글(입력/수정/삭제)인지 구분
															//if 상세보기 -> flag = true, 조회수++
															//if 댓글 -> flag = false, 조회수는 그대로	

	if(flag){
		var sql = "update story set hit = hit+1 where story_id = "+story_id;//1)조회수++
	}else{
		var sql = "SELECT 'nothing' FROM DUAL";//1)의미없는 dummy query
	}

	con.query(sql, function(error, fields){
		if(error){
			console.log("글 한 편 조회 실패", error);
		}else{
			sql = "select * from story where story_id ="+story_id;//2)글 한건 목록 페이지에 불러오기

			con.query(sql, function(error,record, fields){
				//3)댓글 목록 페이지에 불러오기
				sql = "select comment_id, story_id, writer, content, date_format(regdate, '%Y-%m-%d-%H:%i') regdate from comment where story_id ="+story_id;

				con.query(sql, function(error, rows, fields){
					fs.readFile("detail_story.ejs", "utf-8", function(error, data){
						if(error){
							console.log("글 상세 ejs 불러오기 실패", error);
						}else{
							response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
							response.end(ejs.render(data, {
								story: record[0]
								, sessionId : userJson.id,
								commentArray : rows
							}));
						}
					});
				});
			});
		}
	});
});

//댓글 등록
app.get("/regist/comment", function(request, response){
	var writer = userJson.id;
	var story_id = request.query.story_id;
	var content = request.query.content; 

	var sql = "insert into comment(writer, story_id, content) values (?, ?, ?)";//상세글 번호에 따라 댓글 가져오기(글 한건마다 해당 댓글 여러개 가져오기)

	con.query(sql, [writer, story_id, content], function(error, record, fields){
		if(error){
			console.log("failed to insert comment", error);
		}else{
			response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
			response.end(common.getMsgURL("댓글 입력 성공", "/detail_story?story_id="+story_id));//다시 페이지 갱신
		}
	});
});

//댓글 삭제
app.get("/delete/comment", function(request, response){
	var comment_id = request.query.comment_id;
	var story_id = request.query.story_id;

	var sql = "delete from comment where comment_id=" + comment_id;
	con.query(sql, function(error, fields){
		if(error){
			console.log("failed to delete comment : " + error);
		}else{
			response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
			response.end(common.getMsgURL("success to delete comment", "/detail_story?story_id="+story_id));
		}
	});
});

//댓글 수정
app.get("/update/comment", function(request, response){
	var comment_id = request.query.comment_id;
	var content = request.query.content;
	var story_id = request.query.story_id;

	var sql = "UPDATE comment SET content=? WHERE comment_id=?";
	con.query(sql, [content, comment_id], function(error, fields){
		if(error){
			console.log("failed to update comment : " + error);
		}else{
			response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
			response.end(common.getMsgURL("success to update comment", "/detail_story?story_id="+story_id));
		}
	});
});

//작품 삭제
app.get("/delete_poem", function(request, response){
	var poem_id = request.query.poem_id;
	
	var sql = "delete from poem where poem_id ="+poem_id;
	
	con.query(sql, function(error, record, fields){
		if(error){
			console.log("시 한 편 삭제 실패", error);
		}else{
			if(error){
				console.log("시 목록 ejs 불러오기 실패", error);
			}else{
				response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
				response.end(common.getMsgURL("글 삭제 성공", "/board_poem"));
			}
		}
	})
});

//작품 수정폼
app.get("/updateForm_poem", function(request, response){
	var poem_id = request.query.poem_id;
	
	var sql = "select * from poem where poem_id ="+poem_id;
	
	con.query(sql, function(error, record, fields){
		if(error){
			console.log("시 한 편 조회 실패", error);
		}else{
			fs.readFile("updateForm_poem.ejs", "utf-8", function(error, data){
				if(error){
					console.log("시 상세 ejs 불러오기 실패", error);
				}else{
					response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
					response.end(ejs.render(data, {
						poem: record[0]
						, sessionId : userJson.id
					}));
				}
			});
		}
	})
});

//작품 수정
app.get("/update_poem", function(request, response){
	var poem_id = parseInt(request.query.poem_id);
	var title = request.query.title;
	var writer = userJson.id;
	var content = request.query.content;
	
	var sql = "update poem set title = ?, writer =?, content = ? where poem_id = ?";
	
	con.query(sql, [title, writer, content, poem_id],function(error, record, fields){
		if(error){
			console.log("시 한 편 수정 실패", error);
		}else{
			if(error){
				console.log("시 목록 ejs 불러오기 실패", error);
			}else{
				response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
				response.end(common.getMsgURL("글 수정 성공", "/board_poem"));
			}
		}
	})
});

//이야기 삭제
app.get("/delete_story", function(request, response){
	var story_id = request.query.story_id;
	
	var sql = "delete from story where story_id ="+story_id;
	
	con.query(sql, function(error, record, fields){
		if(error){
			console.log("글 한 편 삭제 실패", error);
		}else{
			if(error){
				console.log("글 목록 ejs 불러오기 실패", error);
			}else{
				response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
				response.end(common.getMsgURL("글 삭제 성공", "/board_story"));
			}
		}
	})
});

//이야기 수정폼
app.get("/updateForm_story", function(request, response){
	var story_id = request.query.story_id;
	
	var sql = "select * from story where story_id ="+story_id;
	
	con.query(sql, function(error, record, fields){
		if(error){
			console.log("시 한 편 조회 실패", error);
		}else{
			fs.readFile("updateForm_story.ejs", "utf-8", function(error, data){
				if(error){
					console.log("시 상세 ejs 불러오기 실패", error);
				}else{
					response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
					response.end(ejs.render(data, {
						story: record[0]
						, sessionId : userJson.id
					}));
				}
			});
		}
	})
});

//이야기 수정
app.get("/update_story", function(request, response){
	var story_id = parseInt(request.query.story_id);
	var title = request.query.title;
	var writer = userJson.id;
	var content = request.query.content;
	
	var sql = "update story set title = ?, writer =?, content = ? where story_id = ?";
	
	con.query(sql, [title, writer, content, story_id],function(error, record, fields){
		if(error){
			console.log("글 한 편 수정 실패", error);
		}else{
			if(error){
				console.log("글 목록 ejs 불러오기 실패", error);
			}else{
				response.writeHead(200, {"Content-Type":"text/html;charset=utf-8"});
				response.end(common.getMsgURL("글 수정 성공", "/board_story"));
			}
		}
	})
});

var server = http.createServer(app);

server.listen(3093, function(){
	console.log("The Siru Server is running at port 3093");
	connect();
});
