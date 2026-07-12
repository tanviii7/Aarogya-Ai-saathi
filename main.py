import os
import json
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
import datetime
import threading
from google import genai
from google.genai import types

# Define database file path
DB_FILE = os.path.join(os.path.dirname(__file__), 'data', 'db.json')
ENV_FILE = os.path.join(os.path.dirname(__file__), '.env')

# Database Lock for Thread Safety
db_lock = threading.Lock()

def get_api_key():
    """Helper to get Gemini API key from environment or .env file."""
    # 1. Check environment variable
    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key:
        return api_key

    # 2. Check local .env file
    if os.path.exists(ENV_FILE):
        try:
            with open(ENV_FILE, 'r', encoding='utf-8') as f:
                for line in f:
                    if line.strip().startswith("GEMINI_API_KEY="):
                        return line.strip().split("=", 1)[1].strip().strip('"').strip("'")
        except Exception:
            pass
    return None

class JSONDatabase:
    """Thread-safe CRUD operations for JSON database."""
    @staticmethod
    def _read():
        with db_lock:
            if not os.path.exists(DB_FILE):
                os.makedirs(os.path.dirname(DB_FILE), exist_ok=True)
                default_db = {"workers": {}, "attendance": [], "visits": [], "reports": [], "chats": {}}
                with open(DB_FILE, 'w', encoding='utf-8') as f:
                    json.dump(default_db, f, indent=2)
                return default_db
            try:
                with open(DB_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                return {"workers": {}, "attendance": [], "visits": [], "reports": [], "chats": {}}

    @staticmethod
    def _write(data):
        with db_lock:
            os.makedirs(os.path.dirname(DB_FILE), exist_ok=True)
            with open(DB_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)

    @classmethod
    def get_or_create_worker(cls, name, worker_id):
        db = cls._read()

        worker_id = str(worker_id).strip()
        name = str(name).strip()

        # Worker ID already exists
        if worker_id in db["workers"]:

            existing = db["workers"][worker_id]

            # Wrong name with same Worker ID
            if existing["name"].lower() != name.lower():
                raise ValueError(
                    f"Worker ID {worker_id} already belongs to User."
                )

            # Same worker logging in again
            return existing

        # Check if same name already has another Worker ID
        for worker in db["workers"].values():
            if worker["name"].lower() == name.lower():
                raise ValueError(
                    f"{name} is already registered with Worker ID {worker['worker_id']}."
                )

        # Create new worker
        db["workers"][worker_id] = {
            "name": name,
            "worker_id": worker_id,
            "created_at": datetime.datetime.now().isoformat()
        }

        cls._write(db)

        return db["workers"][worker_id]

    @classmethod
    def get_worker(cls, worker_id):
        db = cls._read()
        return db["workers"].get(str(worker_id).strip())

    @classmethod
    def check_in(cls, worker_id, check_in_time=None, date_str=None):
        db = cls._read()
        worker = db["workers"].get(str(worker_id).strip())
        if not worker:
            return {"error": "Worker not found"}

        now = datetime.datetime.now()
        date = date_str or now.strftime("%Y-%m-%d")
        time = check_in_time or now.strftime("%H:%M:%S")

        # Check if already checked in today
        for record in db["attendance"]:
            if record["worker_id"] == worker_id and record["date"] == date:
                return {"error": "Already checked in today", "record": record}

        record = {
            "worker_id": worker_id,
            "worker_name": worker["name"],
            "date": date,
            "check_in": time,
            "check_out": None,
            "remarks": None
        }
        db["attendance"].append(record)
        cls._write(db)
        return {"success": True, "record": record}

    @classmethod
    def check_out(cls, worker_id, check_out_time=None, date_str=None):
        db = cls._read()
        worker = db["workers"].get(str(worker_id).strip())
        if not worker:
            return {"error": "Worker not found"}

        now = datetime.datetime.now()
        date = date_str or now.strftime("%Y-%m-%d")
        time = check_out_time or now.strftime("%H:%M:%S")

        # Find today's check-in
        for record in db["attendance"]:
            if record["worker_id"] == worker_id and record["date"] == date:
                if record["check_out"] is not None:
                    return {"error": "Already checked out today", "record": record}
                record["check_out"] = time
                cls._write(db)
                return {"success": True, "record": record}

        # If no check-in, create a default check-in and checkout
        record = {
            "worker_id": worker_id,
            "worker_name": worker["name"],
            "date": date,
            "check_in": "09:00:00", # default checkin
            "check_out": time,
            "remarks": "Auto-check-in on check-out"
        }
        db["attendance"].append(record)
        cls._write(db)
        return {"success": True, "record": record}

    @classmethod
    def log_visit(cls, worker_id, village, tasks, remarks=None, date_str=None):
        db = cls._read()
        worker = db["workers"].get(str(worker_id).strip())
        if not worker:
            return {"error": "Worker not found"}

        now = datetime.datetime.now()
        date = date_str or now.strftime("%Y-%m-%d")
        time = now.strftime("%H:%M:%S")

        record = {
            "worker_id": worker_id,
            "worker_name": worker["name"],
            "date": date,
            "time": time,
            "village": village,
            "tasks": tasks,
            "remarks": remarks
        }
        db["visits"].append(record)
        cls._write(db)
        return {"success": True, "record": record}

    @classmethod
    def save_report(cls, worker_id, raw_notes, generated_report, date_str=None):
        db = cls._read()
        worker = db["workers"].get(str(worker_id).strip())
        if not worker:
            return {"error": "Worker not found"}

        now = datetime.datetime.now()
        date = date_str or now.strftime("%Y-%m-%d")

        record = {
            "worker_id": worker_id,
            "worker_name": worker["name"],
            "date": date,
            "created_at": now.isoformat(),
            "raw_notes": raw_notes,
            "report": generated_report
        }
        db["reports"].append(record)
        cls._write(db)
        return {"success": True, "record": record}

    @classmethod
    def get_history(cls, worker_id):
        db = cls._read()
        worker_id = str(worker_id).strip()
        attendance = [r for r in db["attendance"] if r["worker_id"] == worker_id]
        visits = [r for r in db["visits"] if r["worker_id"] == worker_id]
        reports = [r for r in db["reports"] if r["worker_id"] == worker_id]
        return {
            "attendance": sorted(attendance, key=lambda x: x["date"], reverse=True),
            "visits": sorted(visits, key=lambda x: (x["date"], x["time"]), reverse=True),
            "reports": sorted(reports, key=lambda x: x["date"], reverse=True)
        }

    @classmethod
    def get_profile_stats(cls, worker_id):
        db = cls._read()
        worker_id = str(worker_id).strip()
        worker = db["workers"].get(worker_id)
        if not worker:
            return None

        history = cls.get_history(worker_id)
        total_working_days = len(history["attendance"])
        
        last_attendance = "N/A"
        if history["attendance"]:
            last_record = history["attendance"][0]
            last_attendance = f"{last_record['date']} ({last_record['check_in']})"

        # Unique villages visited
        villages = set(v["village"] for v in history["visits"])
        
        return {
            "name": worker["name"],
            "worker_id": worker["worker_id"],
            "total_working_days": total_working_days,
            "last_attendance": last_attendance,
            "villages_visited": list(villages),
            "total_reports_submitted": len(history["reports"])
        }

    @classmethod
    def get_chat_history(cls, worker_id):
        db = cls._read()
        worker_id = str(worker_id).strip()
        return db["chats"].get(worker_id, [])

    @classmethod
    def save_chat_message(cls, worker_id, role, text):
        db = cls._read()
        worker_id = str(worker_id).strip()
        if worker_id not in db["chats"]:
            db["chats"][worker_id] = []
        db["chats"][worker_id].append({
            "role": role,
            "text": text,
            "timestamp": datetime.datetime.now().isoformat()
        })
        # Limit history to last 20 messages for context window efficiency
        if len(db["chats"][worker_id]) > 20:
            db["chats"][worker_id] = db["chats"][worker_id][-20:]
        cls._write(db)


# Gemini Service Layer
def generate_professional_report(api_key, raw_notes, worker_name):
    """Call Google Gemini 2.5 Flash to expand short notes into a professional healthcare daily report."""
    if not api_key:
        return "Error: Gemini API Key not configured. Please set it in the Setup settings."
    
    try:
        client = genai.Client(api_key=api_key)
        prompt = f"""
        As a professional healthcare writing assistant, expand the following rough, shorthand daily notes from health worker {worker_name} into a professional, formal daily activity report suitable for clinical supervisors and regional health managers.
        
        Follow these rules:
        1. Maintain an objective, professional, and clear tone.
        2. Format the output with clear markdown headings (e.g., # Summary of Activities, ## Village Visits & Metrics, ## Observations & Recommendations).
        3. Do not invent any new visits, vaccinations, or patient counts, but write out shorthand notation professionally (e.g., "Vaccinated 18 children" becomes "Administered vaccinations to 18 pediatric patients").
        4. Organize the report logically.
        
        Health Worker Notes:
        "{raw_notes}"
        """
        
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.2
            )
        )
        return response.text
    except Exception as e:
        return f"Failed to generate report via Gemini API: {str(e)}"

def run_ai_chatbot(api_key, worker_id, user_message):
    """Processes chat message using Gemini, integrating worker context and history."""
    if not api_key:
        return "Error: Gemini API Key not configured. Please enter it on the Setup tab.", None

    worker = JSONDatabase.get_worker(worker_id)
    if not worker:
        return "Error: Session expired or worker not found.", None

    # Load context data to make chatbot smart
    history = JSONDatabase.get_history(worker_id)
    stats = JSONDatabase.get_profile_stats(worker_id)
    chat_logs = JSONDatabase.get_chat_history(worker_id)

    # Format recent history for system context
    today_str = datetime.date.today().strftime("%Y-%m-%d")
    
    context_summary = {
        "current_date": today_str,
        "worker_name": worker["name"],
        "worker_id": worker["worker_id"],
        "total_working_days": stats["total_working_days"],
        "villages_visited_so_far": stats["villages_visited"],
        "total_reports_submitted": stats["total_reports_submitted"],
        "recent_attendance": history["attendance"][:5],
        "recent_field_visits": history["visits"][:5],
        "recent_reports": [{"date": r["date"], "summary": r["report"][:100] + "..."} for r in history["reports"][:3]]
    }

    # Format chat history for Gemini API
    # google-genai Client expects list of types.Content or simple dialog
    # We construct a system prompt detailing who the bot is and providing tools/tags
    system_instruction = f"""
    You are the AI Assistant for the "Rural Health Worker Attendance & Daily Reporting System".
    You are assisting the health worker: {worker['name']} (ID: {worker['worker_id']}).
    Current date is: {today_str}.
    
    Worker's current context data:
    {json.dumps(context_summary, indent=2)}
    
    Your role is to help this worker manage their tasks:
    1. Answer queries about their attendance, field visits, or reports.
    2. Help them write daily reports or summarize their activities.
    3. Perform system actions on their behalf. If the worker asks you to perform an action, you MUST append a specific instruction tag at the end of your response:
       - To check in: `[ACTION: CHECK_IN]`
       - To check out: `[ACTION: CHECK_OUT]`
       - To log a village visit: `[ACTION: VISIT: <village_name> | <tasks_completed> | <remarks_or_empty>]`
       - To generate a report: `[ACTION: REPORT: <raw_shorthand_notes>]`
    4. General Healthcare Information
         You may answer general healthcare-related questions, including:
        - Common illnesses and symptoms
        - Preventive healthcare
        - Nutrition and hygiene
        - Maternal and child healthcare
        - Vaccination awareness
        - First aid
        - Healthy lifestyle guidance
    Do NOT:
- Diagnose diseases.
- Prescribe medicines.
- Recommend medication dosages.
- Replace a doctor or qualified healthcare professional.

If a user describes severe or emergency symptoms, advise them to seek immediate medical attention.
Provide educational information in clear, simple language.
       
    Examples:
    - If the user says "Check me in", you reply: "I have successfully marked your check-in for today, {worker['name']}! [ACTION: CHECK_IN]"
    - If the user says "I visited Rampur village and did child checkups", you reply: "Logged village visit to Rampur. [ACTION: VISIT: Rampur | Child checkups | Logged via chat]"
    - If the user says "Help me write a report: Vaccinated 10 kids at Rampur", you reply: "Sure, let's draft your report! [ACTION: REPORT: Vaccinated 10 kids at Rampur]"

    Keep answers friendly, helpful, concise, and focused on healthcare workers' tasks.
    """

    # Assemble conversation contents
    contents = []
    # Add recent chat history (role: user/model)
    for msg in chat_logs[-6:]: # send last 6 messages
        role_map = "user" if msg["role"] == "user" else "model"
        contents.append(types.Content(
            role=role_map,
            parts=[types.Part.from_text(text=msg["text"])]
        ))
    
    # Add current user message
    contents.append(types.Content(
        role="user",
        parts=[types.Part.from_text(text=user_message)]
    ))

    try:
        client = genai.Client(api_key=api_key)
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=0.3
        )
        
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=contents,
            config=config
        )
        
        reply_text = response.text
        
        # Save messages in history
        JSONDatabase.save_chat_message(worker_id, "user", user_message)
        JSONDatabase.save_chat_message(worker_id, "model", reply_text)

        # Parse actions
        action_triggered = None
        action_data = None
        
        if "[ACTION: CHECK_IN]" in reply_text:
            action_triggered = "check_in"
            res = JSONDatabase.check_in(worker_id)
            if "error" in res:
                reply_text += f"\n*(System Note: {res['error']}.)*"
            else:
                reply_text += "\n*(System Note: Check-In logged successfully.)*"
        elif "[ACTION: CHECK_OUT]" in reply_text:
            action_triggered = "check_out"
            res = JSONDatabase.check_out(worker_id)
            if "error" in res:
                reply_text += f"\n*(System Note: {res['error']}.)*"
            else:
                reply_text += "\n*(System Note: Check-Out logged successfully.)*"
        elif "[ACTION: VISIT:" in reply_text:
            try:
                # Parse: [ACTION: VISIT: Rampur | Child checkups | Logged via chat]
                start = reply_text.find("[ACTION: VISIT:")
                end = reply_text.find("]", start)
                action_str = reply_text[start+15:end] # village | tasks | remarks
                parts = [p.strip() for p in action_str.split("|")]
                village = parts[0]
                tasks = parts[1] if len(parts) > 1 else ""
                remarks = parts[2] if len(parts) > 2 else "Logged via chatbot"
                
                action_triggered = "visit"
                action_data = {"village": village, "tasks": tasks, "remarks": remarks}
                res = JSONDatabase.log_visit(worker_id, village, tasks, remarks)
                if "error" in res:
                    reply_text += f"\n*(System Note: Visit logging failed: {res['error']}.)*"
                else:
                    reply_text += f"\n*(System Note: Village visit to {village} logged successfully.)*"
            except Exception as ex:
                reply_text += f"\n*(System Note: Failed to automatically parse visit details: {str(ex)})*"
        elif "[ACTION: REPORT:" in reply_text:
            try:
                start = reply_text.find("[ACTION: REPORT:")
                end = reply_text.find("]", start)
                notes = reply_text[start+16:end].strip()
                
                action_triggered = "report"
                # Generate report sync for simplicity in chat flow
                report_content = generate_professional_report(api_key, notes, worker["name"])
                res = JSONDatabase.save_report(worker_id, notes, report_content)
                if "error" in res:
                    reply_text += f"\n*(System Note: Failed to save report: {res['error']}.)*"
                else:
                    action_data = {"raw_notes": notes, "report": report_content}
                    reply_text += f"\n\n**Generated Report:**\n{report_content}\n\n*(System Note: Report saved successfully.)*"
            except Exception as ex:
                reply_text += f"\n*(System Note: Failed to generate report: {str(ex)})*"

        return reply_text, {"action": action_triggered, "data": action_data}
    except Exception as e:
        return f"Failed to get AI assistant response: {str(e)}", None


# HTTP Request Handler Class
class HealthAssistantHandler(BaseHTTPRequestHandler):
    def end_headers(self):
        # Prevent caching for development simplicity
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        super().end_headers()

    def do_GET(self):
        # Route to public folder files
        url_path = urllib.parse.urlparse(self.path).path
        if url_path == '/':
            url_path = '/index.html'

        # Build absolute path to public file
        public_dir = os.path.join(os.path.dirname(__file__), 'public')
        file_path = os.path.abspath(os.path.join(public_dir, url_path.lstrip('/')))

        # Security check: Ensure file is inside the public folder
        if not file_path.startswith(public_dir):
            self.send_response(403)
            self.end_headers()
            self.wfile.write(b"Forbidden")
            return

        # Serve static file if exists
        if os.path.exists(file_path) and os.path.isfile(file_path):
            self.send_response(200)
            # Send appropriate Content-Type header
            if file_path.endswith('.html'):
                self.send_header('Content-Type', 'text/html; charset=utf-8')
            elif file_path.endswith('.css'):
                self.send_header('Content-Type', 'text/css; charset=utf-8')
            elif file_path.endswith('.js'):
                self.send_header('Content-Type', 'application/javascript; charset=utf-8')
            elif file_path.endswith('.json'):
                self.send_header('Content-Type', 'application/json; charset=utf-8')
            elif file_path.endswith('.png'):
                self.send_header('Content-Type', 'image/png')
            elif file_path.endswith('.jpg') or file_path.endswith('.jpeg'):
                self.send_header('Content-Type', 'image/jpeg')
            elif file_path.endswith('.svg'):
                self.send_header('Content-Type', 'image/svg+xml')
            else:
                self.send_header('Content-Type', 'application/octet-stream')
            self.end_headers()
            
            with open(file_path, 'rb') as f:
                self.wfile.write(f.read())
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"File Not Found")

    def do_POST(self):
        # Handle API calls
        url_path = urllib.parse.urlparse(self.path).path
        
        # Read request body
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        
        try:
            body = json.loads(post_data.decode('utf-8')) if content_length > 0 else {}
        except Exception:
            self.send_json_response(400, {"error": "Invalid JSON format"})
            return

        api_key = get_api_key()

        if url_path == '/api/check-config':
            self.send_json_response(200, {"api_key_configured": api_key is not None})

        elif url_path == '/api/save-config':
            new_key = body.get("gemini_api_key", "").strip()
            if not new_key:
                self.send_json_response(400, {"error": "API Key is required"})
                return
            try:
                with open(ENV_FILE, 'w', encoding='utf-8') as f:
                    f.write(f"GEMINI_API_KEY={new_key}\n")
                self.send_json_response(200, {"success": True, "message": "API key saved to .env file."})
            except Exception as e:
                self.send_json_response(500, {"error": f"Failed to save key: {str(e)}"})

        elif url_path == '/api/login':
            name = body.get("name", "").strip()
            worker_id = body.get("worker_id", "").strip()

            if not name or not worker_id:
                self.send_json_response(
                    400,
                    {"error": "Name and Worker ID are required"}
                )
                return

            try:
                worker = JSONDatabase.get_or_create_worker(name, worker_id)

                self.send_json_response(
                    200,
                    {
                        "success": True,
                        "worker": worker
                    }
                )

            except ValueError as e:
                self.send_json_response(
                    400,
                    {
                        "success": False,
                        "error": str(e)
                    }
                )

        elif url_path == '/api/check-in':
            w_id = body.get("worker_id", "").strip()
            time = body.get("time") # Optional, defaults to server now
            date = body.get("date") # Optional
            if not w_id:
                self.send_json_response(400, {"error": "Worker ID is required"})
                return
            res = JSONDatabase.check_in(w_id, time, date)
            status = 200 if "success" in res else 400
            self.send_json_response(status, res)

        elif url_path == '/api/check-out':
            w_id = body.get("worker_id", "").strip()
            time = body.get("time") # Optional
            date = body.get("date") # Optional
            if not w_id:
                self.send_json_response(400, {"error": "Worker ID is required"})
                return
            res = JSONDatabase.check_out(w_id, time, date)
            status = 200 if "success" in res else 400
            self.send_json_response(status, res)

        elif url_path == '/api/field-visit':
            w_id = body.get("worker_id", "").strip()
            village = body.get("village", "").strip()
            tasks = body.get("tasks", "").strip()
            remarks = body.get("remarks", "").strip() or None
            date = body.get("date") # Optional
            if not w_id or not village or not tasks:
                self.send_json_response(400, {"error": "Worker ID, Village, and Tasks are required"})
                return
            res = JSONDatabase.log_visit(w_id, village, tasks, remarks, date)
            status = 200 if "success" in res else 400
            self.send_json_response(status, res)

        elif url_path == '/api/daily-report':
            w_id = body.get("worker_id", "").strip()
            notes = body.get("notes", "").strip()
            date = body.get("date") # Optional
            if not w_id or not notes:
                self.send_json_response(400, {"error": "Worker ID and notes are required"})
                return
            worker = JSONDatabase.get_worker(w_id)
            if not worker:
                self.send_json_response(400, {"error": "Worker not found"})
                return
            
            # Call Gemini
            report = generate_professional_report(api_key, notes, worker["name"])
            if report.startswith("Error"):
                self.send_json_response(400, {"error": report})
                return
            
            res = JSONDatabase.save_report(w_id, notes, report, date)
            status = 200 if "success" in res else 400
            self.send_json_response(status, {**res, "report": report})

        elif url_path == '/api/history':
            w_id = body.get("worker_id", "").strip()
            if not w_id:
                self.send_json_response(400, {"error": "Worker ID is required"})
                return
            history = JSONDatabase.get_history(w_id)
            self.send_json_response(200, history)

        elif url_path == '/api/profile':
            w_id = body.get("worker_id", "").strip()
            if not w_id:
                self.send_json_response(400, {"error": "Worker ID is required"})
                return
            profile_stats = JSONDatabase.get_profile_stats(w_id)
            if not profile_stats:
                self.send_json_response(404, {"error": "Worker profile not found"})
                return
            self.send_json_response(200, profile_stats)

        elif url_path == '/api/chat':
            w_id = body.get("worker_id", "").strip()
            message = body.get("message", "").strip()
            if not w_id or not message:
                self.send_json_response(400, {"error": "Worker ID and message are required"})
                return
            
            reply, action_data = run_ai_chatbot(api_key, w_id, message)
            if reply.startswith("Error"):
                self.send_json_response(400, {"error": reply})
                return
            
            self.send_json_response(200, {"reply": reply, "action_triggered": action_data})

        else:
            self.send_json_response(404, {"error": "API Route Not Found"})

    def send_json_response(self, status_code, data_dict):
        """Utility method to send clean JSON response."""
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        self.wfile.write(json.dumps(data_dict).encode('utf-8'))

def run_server(port=8000):
    server_address = ('', port)
    httpd = HTTPServer(server_address, HealthAssistantHandler)
    print(f"Starting Rural Health Assistant server on http://localhost:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.server_close()

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8000))
    run_server(port)