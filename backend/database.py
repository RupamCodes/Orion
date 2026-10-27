import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Resolve default database location relative to backend project directory
BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DATA_DIR = BASE_DIR / "data"
DEFAULT_DB_FILE = DEFAULT_DATA_DIR / "orion.db"

# Allow environment override via ORION_DATABASE_URL
DATABASE_URL = os.environ.get("ORION_DATABASE_URL", f"sqlite:///{DEFAULT_DB_FILE}")

# Ensure database directory exists if using local SQLite file
if DATABASE_URL.startswith("sqlite:///"):
    db_file_str = DATABASE_URL.replace("sqlite:///", "")
    if db_file_str and db_file_str != ":memory:":
        Path(db_file_str).parent.mkdir(parents=True, exist_ok=True)

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    echo=False
)

from sqlalchemy import event
from sqlalchemy.engine import Engine

@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """
    Enforces SQLite foreign key constraints and cascade deletions.
    """
    try:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
    except Exception:
        pass


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """
    FastAPI dependency that yields a database session per request
    and guarantees closure upon completion.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db(target_engine=None):
    """
    Initializes database tables.
    """
    target = target_engine or engine
    Base.metadata.create_all(bind=target)
